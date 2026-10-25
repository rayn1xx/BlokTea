from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

UserRole = Literal[
    "owner", "director", "cfo_or_accountant", "financing_employee", "banking_employee", "authorized_employee"
]
BankRole = Literal["underwriter", "bank_admin"]
LegalForm = Literal["IP", "OOO"]
Permission = Literal["submit_applications", "upload_documents", "sign", "accept_offers", "manage_team"]
ProductCode = Literal[
    "working_capital", "investment", "overdraft", "credit_line", "express", "any_purpose", "gov_program"
]
PurposeCode = Literal[
    "equipment", "repair", "current_expenses", "working_capital", "real_estate", "gov_contract", "other"
]
NeedType = Literal["one_time", "recurring"]
Disbursement = Literal["lump_sum", "tranches"]
Urgency = Literal["asap", "week", "not_urgent"]
CollateralType = Literal["none", "real_estate", "vehicle_equipment", "purchased_asset"]
Preference = Literal["lower_payment", "lower_overpayment", "flexibility"]
ApplicationStatus = Literal[
    "draft",
    "submitted",
    "in_review",
    "info_requested",
    "approved",
    "counter_offer",
    "rejected",
    "signing",
    "issued",
    "cancelled",
]
DataSource = Literal["registry", "alfa_lk", "bki", "fns", "multibank", "client", "system"]
TextSource = Literal["llm", "template"]
FitLevel = Literal["high", "medium", "low"]
ReadinessStatus = Literal["ok", "warning", "fail", "unknown"]
SigningDocument = Literal["contract", "surety", "deal_approval"]
RequirementCode = Literal[
    "consent_bki",
    "consent_pd",
    "company_docs",
    "fin_statements_2025",
    "other_bank_statements",
    "collateral_docs",
]


class Money(BaseModel):
    value: int = Field(description="копейки")
    currency: Literal["RUB"] = "RUB"


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int


class Sourced(BaseModel, Generic[T]):
    value: T
    source: DataSource
    as_of: str | None
    editable: bool


class Person(BaseModel):
    user_id: str
    name: str
    role: UserRole


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any]


class ErrorResponse(BaseModel):
    error: ErrorBody


class InviteAcceptRequest(BaseModel):
    invite_code: str
    password: str
    first_name: str | None = None
    last_name: str | None = None


class InviteAcceptResponse(BaseModel):
    status: Literal["pending_approval"]
    login: str


class Verification(BaseModel):
    source: str
    verified_at: str


class Company(BaseModel):
    id: str
    legal_form: LegalForm
    inn: str
    ogrn: str
    kpp: str | None
    full_name: str
    short_name: str
    registration_date: str
    okved_main: str
    okved_additional: list[str]
    legal_address: str
    registry_status: Literal["active", "liquidating", "liquidated"]
    msp_category: Literal["micro", "small", "medium"] | None
    employees_count: int | None
    director: Person | None
    verification: Verification
    created_at: str
    updated_at: str


class AccountSummary(BaseModel):
    id: str
    owner_type: Literal["company", "user"]
    type: Literal["settlement", "current", "deposit", "credit"]
    currency: str
    name: str | None
    is_primary: bool
    current_money: Money


class Onboarding(BaseModel):
    completed: bool
    progress_percent: int
    next_step: Literal["registry_confirm", "company_details"] | None


class Home(BaseModel):
    id: str
    first_name: str
    middle_name: str | None
    last_name: str
    birth_date: str | None
    role: UserRole | None
    permissions: list[Permission]
    home_profile: Literal["entrepreneur", "accountant"]
    bank_role: BankRole | None
    company: Company | None
    accounts: list[AccountSummary]
    onboarding: Onboarding
    unread_notifications: int


class Registry(BaseModel):
    source: Literal["EGRUL", "EGRIP"]
    fetched_at: str
    confirmed: bool
    issue_comment: str | None


class AlfaLoans(BaseModel):
    count: int
    monthly_payment: Money


class FromLk(BaseModel):
    employees_count: Sourced[int | None]
    monthly_inflow_avg: Sourced[Money]
    tax_regime: Sourced[Literal["osn", "usn_income", "usn_income_expense", "patent", "ausn"] | None]
    alfa_loans: Sourced[AlfaLoans]


class ExternalDebt(BaseModel):
    lender: str
    balance: Money
    monthly_payment: Money


class ClientInput(BaseModel):
    external_debts: list[ExternalDebt]
    collateral_available: list[CollateralType]


class CompanyProfile(BaseModel):
    company: Company
    registry: Registry
    from_lk: FromLk
    client_input: ClientInput
    completeness_percent: int
    available_actions: list[str]


class RegistryConfirmRequest(BaseModel):
    confirmed: bool
    issue_comment: str | None = None


class CompanyDetailsPatch(BaseModel):
    external_debts: list[ExternalDebt] | None = None
    collateral_available: list[CollateralType] | None = None
    employees_count: int | None = None
    monthly_inflow_avg: Money | None = None
    tax_regime: Literal["osn", "usn_income", "usn_income_expense", "patent", "ausn"] | None = None


class OnboardingCompleteRequest(BaseModel):
    skipped: bool = False


class Period(BaseModel):
    from_: str = Field(alias="from", serialization_alias="from")
    to: str

    model_config = {"populate_by_name": True}


class MonthRow(BaseModel):
    month: str
    inflow: Money
    outflow: Money


class Seasonality(BaseModel):
    low_months: list[int]
    text: str


class FinanceDebt(BaseModel):
    lender: str
    source: Literal["alfa_lk", "bki", "client"]
    balance: Money
    monthly_payment: Money
    overdue: bool


class Debts(BaseModel):
    items: list[FinanceDebt]
    total_monthly_payment: Money


class Stale(BaseModel):
    reason: Literal["no_fin_statements_2025", "old_statement"] | None
    text: str | None


class FinanceSummary(BaseModel):
    period: Period
    monthly_inflow_avg: Sourced[Money]
    monthly_operating_outflow_avg: Sourced[Money]
    free_cash_flow: Sourced[Money]
    months: list[MonthRow]
    seasonality: Seasonality | None
    debts: Debts
    multibank_connected: bool
    stale: Stale
    confirmed_at: str | None


class DebtAdd(BaseModel):
    lender: str
    balance: Money | None = None
    monthly_payment: Money


class FinanceSummaryPatch(BaseModel):
    monthly_inflow_avg: Money | None = None
    monthly_operating_outflow_avg: Money | None = None
    debts_add: list[DebtAdd] | None = None
    confirm: bool | None = None


class Member(BaseModel):
    id: str
    user_id: str | None
    last_name: str
    first_name: str
    middle_name: str | None
    role: UserRole
    permissions: list[Permission]
    status: Literal["active", "invited", "pending_approval", "disabled"]
    has_alfa_business_access: bool
    login: str | None
    created_at: str


class InviteRequest(BaseModel):
    last_name: str = ""
    first_name: str = ""
    middle_name: str | None = None
    role: str | None = None
    login_email: str = ""
    permissions: list[str] | None = None


class InviteResponse(BaseModel):
    member: Member
    invite_code: str
    expires_at: str


class MemberPatch(BaseModel):
    role: str | None = None
    permissions: list[str] | None = None


class SignerRule(BaseModel):
    order: int
    document: SigningDocument
    user_id: str | None = None
    role: UserRole | None = None
    required: bool = True


class SigningRules(BaseModel):
    legal_form: LegalForm
    can_send_to_signing: list[UserRole]
    signers: list[SignerRule]
    version: int


class SigningRulesUpdate(BaseModel):
    legal_form: LegalForm | None = None
    can_send_to_signing: list[UserRole] = []
    signers: list[SignerRule]
    version: int


class ApplicationRef(BaseModel):
    id: str
    number: str


class Cta(BaseModel):
    label: str
    route: str


class Task(BaseModel):
    id: str
    type: Literal[
        "info_request", "sign", "accept_offer", "send_application", "approve_member", "consent", "upload_document"
    ]
    title: str
    application: ApplicationRef | None
    assignee: Person | None
    waiting_for_text: str | None
    due_at: str | None
    cta: Cta
    available_actions: list[str]
    created_at: str


class DocumentRequestBody(BaseModel):
    member_id: str
    document_type: str
    application_id: str | None = None
    comment: str | None = None


class MemberIdRequest(BaseModel):
    member_id: str


class Product(BaseModel):
    code: ProductCode
    name: str
    description: str
    purposes: list[PurposeCode]
    need_types: list[NeedType]
    disbursement: list[Disbursement]
    amount_min: Money
    amount_max: Money
    term_min_months: int
    term_max_months: int
    rate_from_percent: float
    collateral: Literal["none", "optional", "required"]
    min_business_age_months: int
    legal_forms: list[LegalForm]
    suits: list[str]
    not_suits: list[str]
    required_document_types: list[str]
    decision_time_text: str
    is_fictional: bool
    source_note: str | None


class PaymentCalcRequest(BaseModel):
    amount: Money
    term_months: int
    rate_percent: float
    schedule: Literal["annuity"] = "annuity"


class ScheduleRow(BaseModel):
    n: int
    date: str
    payment: Money
    principal: Money
    interest: Money
    balance: Money


class PaymentCalcResponse(BaseModel):
    monthly_payment: Money
    total_payment: Money
    overpayment: Money
    schedule: list[ScheduleRow]


class MatchingNeed(BaseModel):
    purpose: PurposeCode | None
    amount: Money | None
    term_months: int | None
    need_type: NeedType | None
    disbursement: Disbursement | None
    urgency: Urgency | None
    collateral: CollateralType | None


class ExpectedPayment(BaseModel):
    counterparty: str
    amount: Money
    date: str
    source: Literal["alfa_lk", "client"]


class CollateralDetails(BaseModel):
    type: CollateralType
    description: str
    estimated_value: Money


class MatchingExtra(BaseModel):
    expected_payments: list[ExpectedPayment]
    other_bank_turnover_monthly: Money | None
    own_funds: Money | None
    collateral_details: CollateralDetails | None
    preference: Preference | None
    skipped: bool


class MatchingSession(BaseModel):
    id: str
    status: Literal["draft", "completed"]
    step: Literal[1, 2, 3, 4]
    need: MatchingNeed
    finance_confirmed: bool
    extra: MatchingExtra
    updated_at: str


class MatchingSessionPatch(BaseModel):
    need: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None
    finance_confirmed: bool | None = None
    step: int | None = None


class LoadCalc(BaseModel):
    free_cash_flow: Money
    current_payments: Money
    new_payment: Money
    load_percent: float
    threshold_percent: float
    target_percent: float


class ProductShort(BaseModel):
    code: ProductCode
    name: str
    is_fictional: bool


class Reason(BaseModel):
    code: str
    text: str
    data_ref: str | None


class Recommendation(BaseModel):
    rank: int
    product: ProductShort
    amount: Money
    term_months: int
    rate_percent: float
    monthly_payment: Money
    overpayment: Money
    load: LoadCalc
    fit: FitLevel
    fit_label: str
    reasons: list[Reason]


class TermsRef(BaseModel):
    amount: Money
    term_months: int


class RequestedTerms(BaseModel):
    amount: Money
    term_months: int
    load: LoadCalc


class RecommendWarning(BaseModel):
    code: Literal["LOAD_ABOVE_THRESHOLD", "TERM_EXTENDED", "COLLATERAL_NEEDED", "DATA_STALE"]
    text: str
    suggested: TermsRef | None


class ReadinessShortItem(BaseModel):
    code: str
    title: str
    status: ReadinessStatus


class ReadinessShort(BaseModel):
    ok_count: int
    total: int
    items: list[ReadinessShortItem]


class RecommendResponse(BaseModel):
    session_id: str
    is_preliminary: bool
    primary: Recommendation
    alternatives: list[Recommendation]
    requested: RequestedTerms
    warnings: list[RecommendWarning]
    readiness: ReadinessShort
    submit_requirements_text: str
    text_source: TextSource


class ProductRef(BaseModel):
    code: ProductCode
    name: str


class PreapprovedOffer(BaseModel):
    offer_id: str
    product: ProductRef
    limit: Money
    term_months: int
    valid_until: str
    conditions_fixed: bool
    source: Literal["alfa_lk"]


class ReadinessAction(BaseModel):
    type: Literal["upload_document", "fill_details", "none"]
    document_type: str | None
    route: str | None


class ReadinessItem(BaseModel):
    code: str
    title: str
    status: ReadinessStatus
    value_text: str
    explanation: str
    how_to_improve: str | None
    action: ReadinessAction | None


class Readiness(BaseModel):
    level: Literal["high", "medium", "low"]
    ok_count: int
    total: int
    items: list[ReadinessItem]
    summary_text: str
    text_source: TextSource
    disclaimer: str
    calculated_at: str


class ApplicationSummary(BaseModel):
    id: str
    number: str
    product: ProductRef
    purpose: str
    requested_amount: Money
    requested_term_months: int
    approved_amount: Money | None
    approved_term_months: int | None
    status: ApplicationStatus
    required_action: str | None
    awaiting_from: Person | None
    available_actions: list[str]
    created_at: str
    updated_at: str


class Counters(BaseModel):
    drafts: int
    in_bank: int
    awaiting_signing: int
    finished: int


class ApplicationsListResponse(Paginated[ApplicationSummary]):
    counters: Counters


class CreateApplicationRequest(BaseModel):
    source: Literal["recommendation", "catalog", "preapproved"]
    matching_session_id: str | None = None
    recommendation_rank: int | None = None
    keep_requested: bool | None = None
    offer_id: str | None = None
    product_code: str | None = None
    amount: Money | None = None
    term_months: int | None = None
    purpose_code: str | None = None
    purpose: str | None = None


class Collateral(BaseModel):
    type: CollateralType
    description: str | None = None
    estimated_value: Money | None = None


class FormState(BaseModel):
    step: Literal["params", "company", "finance", "collateral", "documents", "review"]
    data: dict[str, Any]
    saved_at: str


class TimelineActor(BaseModel):
    type: Literal["client", "bank", "system"]
    name: str | None


class TimelineEvent(BaseModel):
    at: str
    status: ApplicationStatus
    title: str
    description: str | None
    actor: TimelineActor


class StatusText(BaseModel):
    now: str
    next: str
    actor: Literal["client", "bank", "system"]
    due_at: str | None


class InfoRequestResponse(BaseModel):
    comment: str | None
    document_ids: list[str]
    answered_by: Person
    answered_at: str


class InfoRequest(BaseModel):
    id: str
    created_at: str
    due_at: str | None
    question: str
    purpose_text: str | None
    requested_document_types: list[str]
    lk_available: bool
    status: Literal["open", "answered", "closed"]
    response: InfoRequestResponse | None


class CallNote(BaseModel):
    id: str
    stage: ApplicationStatus
    stage_title: str
    called_at: str
    duration_minutes: int | None
    topic: str
    summary: str
    agreements: list[str]
    next_step: str | None
    next_step_due: str | None
    author_name: str


class CallNoteCreate(BaseModel):
    topic: str
    summary: str
    agreements: list[str] = []
    next_step: str | None = None
    next_step_due: str | None = None
    duration_minutes: int | None = None


class Offered(BaseModel):
    product: ProductRef
    amount: Money
    term_months: int
    rate_percent: float
    monthly_payment: Money
    overpayment: Money


class DecisionFactor(BaseModel):
    code: str
    title: str
    impact: Literal["positive", "negative", "neutral"]
    text: str


class Decision(BaseModel):
    type: Literal["approved", "counter_offer", "rejected"]
    decided_at: str
    decided_by: Literal["auto", "underwriter"]
    requested: TermsRef
    offered: Offered | None
    offer_valid_until: str | None
    factors: list[DecisionFactor]
    explanation_text: str
    improve_tips: list[str]
    text_source: TextSource


class SigningDocumentRef(BaseModel):
    id: str
    title: str
    type: SigningDocument
    url: str


class Signer(BaseModel):
    order: int
    person: Person | None
    document: SigningDocument
    status: Literal["waiting", "pending", "signed", "declined"]
    signed_at: str | None


class SigningState(BaseModel):
    documents: list[SigningDocumentRef]
    signers: list[Signer]
    signed_count: int
    required_count: int
    can_current_user_sign: bool
    current_user_document: SigningDocument | None


class ApplicationDetail(ApplicationSummary):
    purpose_code: PurposeCode
    rate_percent: float
    monthly_payment_estimate: Money
    load_at_submit: LoadCalc | None
    client_warning_accepted: bool
    collateral: Collateral | None
    form: FormState
    timeline: list[TimelineEvent]
    status_text: StatusText
    info_requests: list[InfoRequest]
    calls: list[CallNote] = []
    decision: Decision | None
    signing: SigningState | None
    version: int


class FormPatch(BaseModel):
    step: Literal["params", "company", "finance", "collateral", "documents", "review"] | None = None
    data: dict[str, Any] | None = None


class ApplicationPatch(BaseModel):
    version: int
    form: FormPatch | None = None
    amount: Money | None = None
    term_months: int | None = None
    collateral: Collateral | None = None


class RequirementAction(BaseModel):
    type: Literal["sign", "upload", "pick_document", "none"]
    document_type: str | None


class Requirement(BaseModel):
    code: RequirementCode
    title: str
    necessity: Literal["required", "situational"]
    status: Literal["done", "missing", "not_needed"]
    source: str | None
    note: str | None
    action: RequirementAction | None


class RequirementsResponse(BaseModel):
    items: list[Requirement]
    can_submit: bool


class Challenge(BaseModel):
    challenge_id: str
    demo_code: str | None = None
    expires_at: str


class ConfirmRequest(BaseModel):
    challenge_id: str
    code: str


class ReasonRequest(BaseModel):
    reason: str | None = None


class RespondRequest(BaseModel):
    document_ids: list[str] = []
    comment: str | None = None


class RemindRequest(BaseModel):
    user_id: str


class NextPayment(BaseModel):
    date: str
    amount: Money


class LoanPayment(BaseModel):
    date: str
    principal: Money
    interest: Money
    early: Money


class Loan(BaseModel):
    id: str
    application_id: str | None
    product: ProductRef
    amount: Money
    balance: Money
    rate_percent: float
    term_months: int
    next_payment: NextPayment | None
    overpayment_total: Money
    issued_to_account: str
    schedule: list[ScheduleRow]
    payments: list[LoanPayment] = []
    source: Literal["alfa_lk", "system"]


class DocumentType(BaseModel):
    code: str
    title: str
    legal_forms: list[LegalForm]
    required_for_products: list[ProductCode]
    scope: Literal["company", "application"]
    accepted_formats: list[str]
    max_size_mb: int
    max_age_days: int | None
    can_generate_from_lk: bool


class ExtractedField(BaseModel):
    key: str
    label: str
    value: str
    confidence: float


class AnalysisCheck(BaseModel):
    code: Literal["inn_match", "period_valid", "not_expired", "type_match", "signature_present"]
    passed: bool | None
    text: str


class AnalysisIssue(BaseModel):
    severity: Literal["info", "warning", "error"]
    text: str


class DocumentAnalysis(BaseModel):
    status: Literal["pending", "done", "failed", "unavailable"]
    detected_type: str | None
    detected_type_confidence: float | None
    extracted_fields: list[ExtractedField]
    checks: list[AnalysisCheck]
    issues: list[AnalysisIssue]
    model: str | None
    text_source: TextSource
    analyzed_at: str | None


class DocumentRef(BaseModel):
    id: str
    document_type: str
    title: str
    scope: Literal["company", "application"]
    application_id: str | None
    info_request_id: str | None
    file_name: str
    size_bytes: int
    version: int
    uploaded_by: Person
    uploaded_at: str
    origin: Literal["upload", "alfa_lk"]
    status: Literal["uploaded", "analyzing", "accepted", "rejected", "expiring"]
    status_reason: str | None
    expires_at: str | None
    analysis: DocumentAnalysis | None


class FromLkRequest(BaseModel):
    kind: Literal["bank_statement", "tax_data", "fin_turnover"]
    period_from: str
    period_to: str
    info_request_id: str | None = None


class MissingDocument(BaseModel):
    document_type: str
    title: str
    reason: str
    application_id: str | None


class MissingDocuments(BaseModel):
    items: list[MissingDocument]


class FeedItem(BaseModel):
    id: str
    type: Literal["program", "product_update", "application_event", "industry", "tip"]
    title: str
    body: str
    published_at: str
    tags: list[str]
    relevance_reason: str
    cta: Cta | None


class Notification(BaseModel):
    id: str
    created_at: str
    read: bool
    title: str
    text: str
    application_id: str | None
    route: str | None


class QueueCompany(BaseModel):
    id: str
    short_name: str
    legal_form: LegalForm
    inn: str


class BankQueueItem(ApplicationSummary):
    company: QueueCompany
    score: int | None
    risk_level: Literal["low", "medium", "high"] | None
    checks_status: Literal["ok", "warning", "stop"]
    checks_hint: str | None
    auto_decided: bool
    in_queue_minutes: int
    assignee: Person | None


class CheckResult(BaseModel):
    source: Literal["registry", "credit_bureau", "turnover", "fns_transparent", "load"]
    status: Literal["ok", "warning", "stop", "error"]
    summary: str
    details: dict[str, Any]
    checked_at: str
    is_mock: Literal[True] = True


class ScoringThresholds(BaseModel):
    approve_min: int
    counter_offer_min: int
    manual_review_min: int
    load_threshold_percent: float
    load_target_percent: float


class ScoringFactor(BaseModel):
    code: Literal["business_age", "credit_history", "debt_load", "industry", "turnover"]
    title: str
    value_text: str
    points: int
    max_points: int


class ScoringResult(BaseModel):
    total: int
    factors: list[ScoringFactor]
    thresholds: ScoringThresholds
    outcome: Literal["approved", "counter_offer", "manual_review", "rejected"]
    stop_factors: list[str]


class AiSummary(BaseModel):
    text: str
    risks: list[str]
    to_check: list[str]
    text_source: TextSource
    generated_at: str


class AuditEntry(BaseModel):
    at: str
    actor: str
    action: str
    details: str | None


class BankApplicationDetail(ApplicationDetail):
    company: CompanyProfile
    finance: FinanceSummary
    checks: list[CheckResult]
    scoring: ScoringResult
    documents: list[DocumentRef]
    ai_summary: AiSummary | None
    audit: list[AuditEntry]


class CounterOfferOption(BaseModel):
    product_code: ProductCode
    amount: Money
    term_months: int
    monthly_payment: Money
    load: LoadCalc
    score: int


class CounterOfferOptions(BaseModel):
    options: list[CounterOfferOption]


class BankDecisionRequest(BaseModel):
    type: Literal["approve", "counter_offer", "request_info", "reject"]
    comment: str | None = None
    amount: Money | None = None
    term_months: int | None = None
    product_code: str | None = None
    rate_percent: float | None = None
    reason_code: str | None = None
    template_code: str | None = None
    question: str | None = None
    requested_document_types: list[str] | None = None
    due_at: str | None = None
    purpose_text: str | None = None
    reason_codes: list[str] | None = None


class DecisionPreview(BaseModel):
    client_view: Decision | InfoRequest


class InfoRequestTemplate(BaseModel):
    code: str
    title: str
    question: str
    requested_document_types: list[str]


class RejectionReason(BaseModel):
    code: str
    title: str


class BankDashboard(BaseModel):
    period: str
    by_status: dict[str, int]
    avg_decision_minutes: int
    auto_decision_share: float
    info_request_share: float


class LlmModels(BaseModel):
    text: str | None
    vision: str | None


class MocksHealth(BaseModel):
    alfa_lk: Literal["ok", "down"]
    registry: Literal["ok", "down"]
    bki: Literal["ok", "down"]
    fns: Literal["ok", "down"]


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    db: Literal["ok", "down"]
    llm: Literal["up", "down", "stub"]
    llm_models: LlmModels
    mocks: MocksHealth
    demo_mode: bool
