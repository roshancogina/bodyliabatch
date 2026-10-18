package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type App struct {
	store *Store
}

type ginEngine = gin.Engine

func main() {
	_ = godotenv.Load()
	if isProd() {
		// Production boot contract: real secrets + explicit prod database.
		requireEnv("JWT_SECRET")
		requireEnv("DB_HOST")
		requireEnv("DB_USER")
		requireEnv("DB_NAME")
		requireEnv("DB_PASSWORD")
		requireEnv("ALLOWED_ORIGINS")
		dbName := requireEnv("DB_NAME")
		if isTestDatabase(dbName) {
			log.Fatalf("FATAL: production DB_NAME must not look like a test database (got %q)", dbName)
		}
		if os.Getenv("SEED_ON_BOOT") == "1" {
			log.Fatal("FATAL: SEED_ON_BOOT=1 is forbidden in production. Seed a staging DB instead.")
		}
	}
	db := initDB()
	defer db.Close()
	mustApplyMigrations(db, "migrations")
	if isProd() {
		// Live site: purge demo/mock rows, ensure the env-provided admin.
		// Fails closed (no boot) when PROD_ADMIN_* credentials are missing.
		if err := prodBootstrap(db); err != nil {
			log.Fatalf("production bootstrap failed: %v", err)
		}
	}
	app := &App{store: NewStore(db)}
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := newRouter(db)
	_ = app
	port := os.Getenv("PORT")
	if port == "" {
		port = "8101"
	}
	log.Printf("batch.bodylia.in API listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func newRouter(db *sql.DB) *ginEngine {
	app := &App{store: NewStore(db)}
	r := gin.Default()
	r.Use(corsMiddleware())
	r.GET("/api/health", app.handleHealth)

	bff := r.Group("/bff/v1")
	{
		bff.GET("/batches/:batch", app.handleLookup)
		bff.GET("/captcha/challenge", app.handleCaptchaChallenge)
		bff.POST("/reports", app.handleSubmitReport)
		bff.POST("/reports/track", app.handleTrackReport)
		bff.GET("/recalls", app.handleRecalls)
	}

	r.POST("/api/auth/login", app.handleLogin)
	r.POST("/api/auth/verify-2fa", app.handleVerifyTwoFactor)
	r.POST("/api/auth/password", app.authMiddleware(), app.handleChangePassword)
	admin := r.Group("/api/admin", app.authMiddleware())
	{
		admin.GET("/me", app.handleMe)
		admin.GET("/insights", app.handleAdminInsights)
		admin.GET("/batches", app.handleAdminListBatches)
		admin.GET("/batches/:batch", app.handleAdminGetBatch)
		admin.POST("/batches", app.handleAdminRegisterBatch)
		admin.POST("/batches/:batch/aliases", app.handleAddAlias)
		admin.DELETE("/batches/:batch/aliases/:alias", app.handleRemoveAlias)
		admin.GET("/staff", app.handleAdminListStaff)
		admin.POST("/staff", app.handleAdminCreateStaff)
		admin.PATCH("/staff/:id", app.handleAdminUpdateStaff)
		admin.DELETE("/staff/:id", app.handleAdminDeactivateStaff)
	}
	return r
}

func (a *App) handleHealth(c *gin.Context) {
	var batches, reports int
	var dbName string
	_ = a.store.db.QueryRow(`SELECT COUNT(*) FROM batches`).Scan(&batches)
	_ = a.store.db.QueryRow(`SELECT COUNT(*) FROM reports`).Scan(&reports)
	_ = a.store.db.QueryRow(`SELECT current_database()`).Scan(&dbName)
	c.JSON(200, gin.H{
		"status": "healthy", "service": "batch-bodylia-in",
		"time":     time.Now().Format(time.RFC3339),
		"database": dbName, "batches": batches, "reports": reports,
	})
}

func corsMiddleware() gin.HandlerFunc {
	allowed := allowedOrigins()
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if isProd() {
			// Production: echo only allow-listed origins, never "*".
			if originAllowed(origin, allowed) && origin != "" {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Vary", "Origin")
			}
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers",
			"Content-Type, Authorization, accept, origin, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func initDB() *sql.DB {
	host := envOr("DB_HOST", "localhost")
	port := envOr("DB_PORT", "5432")
	user := envOr("DB_USER", "roshanshah")
	password := os.Getenv("DB_PASSWORD")
	dbname := envOr("DB_NAME", "bodyliabatch")
	var connStr string
	if password != "" {
		connStr = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			host, port, user, password, dbname)
	} else {
		connStr = fmt.Sprintf("host=%s port=%s user=%s dbname=%s sslmode=disable",
			host, port, user, dbname)
	}
	var db *sql.DB
	var err error
	for i := 0; i < 5; i++ {
		db, err = sql.Open("postgres", connStr)
		if err == nil {
			if err = db.Ping(); err == nil {
				log.Printf("postgres connected: %s@%s/%s", user, host, dbname)
				return db
			}
		}
		log.Printf("postgres connect attempt %d/5: %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	log.Fatal("could not connect to postgres")
	return nil
}

// allowedOrigins parses ALLOWED_ORIGINS (comma-separated) for production CORS.
func allowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		return []string{"https://batch.bodylia.in"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func originAllowed(origin string, allowed []string) bool {
	for _, a := range allowed {
		if strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(origin)) {
			return true
		}
	}
	return false
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
