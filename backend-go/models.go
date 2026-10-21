package main

import "time"

// Domain models mirror the frontend contracts (src/data/*.ts).

type Product struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	Claim           string `json:"claim"`
	Format          string `json:"format"`
	ImageURL        string `json:"image"`
	ShelfLifeMonths int    `json:"shelfLifeMonths"`
	Archived        bool   `json:"archived"`
}

type Site struct {
	ID                   string `json:"id"`
	Kind                 string `json:"kind"`
	Name                 string `json:"name"`
	Accreditation        string `json:"accreditation"`
	AccreditationExpires string `json:"accreditationExpires"`
	Archived             bool   `json:"archived"`
}

type CoaRow struct {
	Test          string `json:"test"`
	Specification string `json:"specification"`
	Result        string `json:"result"`
	Pass          bool   `json:"pass"`
}

type BatchAlias struct {
	Code string `json:"code"`
	Kind string `json:"kind"`
}

type BatchRecord struct {
	Batch          string   `json:"batch"`
	Product        string   `json:"product"`
	ProductName    string   `json:"productName,omitempty"`
	Manufactured   string   `json:"manufactured"`
	Expires        string   `json:"expires"`
	Lab            string   `json:"lab"`
	Facility       string   `json:"facility"`
	Status         string   `json:"status"`
	RecallReason   *string  `json:"recallReason,omitempty"`
	Coa            []CoaRow `json:"coa"`
	FirstCheckedAt *string  `json:"firstCheckedAt,omitempty"`
	CoaFileName    *string  `json:"coaFileName,omitempty"`
	Aliases        []BatchAlias `json:"aliases"`
	Qty            *int     `json:"qty,omitempty"`
	Mrp            *float64 `json:"mrp,omitempty"`
}

type LookupResult struct {
	Kind         string       `json:"kind"`
	MatchedKind  *string      `json:"matchedKind,omitempty"`
	Record       *BatchRecord `json:"record,omitempty"`
	MatchedAlias *string      `json:"matchedAlias,omitempty"`
	RetryAfter   *int         `json:"retryAfterSeconds,omitempty"`
}

type StaffUser struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	Status     string     `json:"status"`
	MFA        bool       `json:"mfa"`
	LastActive *time.Time `json:"lastActive,omitempty"`
}

type TimelineEvent struct {
	At   time.Time `json:"at"`
	By   string    `json:"by"`
	Kind string    `json:"kind"`
	Text string    `json:"text"`
}

type Report struct {
	Reference     string          `json:"reference"`
	FullName      string          `json:"fullName"`
	Email         string          `json:"email"`
	Phone         *string         `json:"phone,omitempty"`
	Batch         string          `json:"batch"`
	Channel       string          `json:"channel"`
	OrderNumber   *string         `json:"orderNumber,omitempty"`
	PurchaseDate  *string         `json:"purchaseDate,omitempty"`
	BatchVerified bool            `json:"batchVerified"`
	Message       string          `json:"message"`
	PhotoName     *string         `json:"photoName,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
	Status        string          `json:"status"`
	Assignee      *string         `json:"assignee,omitempty"`
	Timeline      []TimelineEvent `json:"timeline"`
}
