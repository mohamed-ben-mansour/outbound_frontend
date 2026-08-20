// Quick sanity check: every ICP hint regex must fire on the example brief.
const t = `We sell NudgeShield cyber-risk analytics to mid-market insurance and financial services companies in the United States. Contact risk, underwriting, and revenue leaders.

- Industry: Insurance, Financial Services, Banking, Fintech
- Company size: 200 to 5000 employees
- Located in: United States
- Annual revenue / ARR: $10,000,000 to $500,000,000
- Preferred cities: San Francisco (United States), New York (United States), Austin (United States)
- Tech stack: Guidewire, Salesforce, Snowflake, AWS, Tableau, Slack
- Growth stage: growth stage
- Funding stage: Series B, Series C, or later

Exclude:
- Industries: Gambling, Government, Non-profit, Software
- Keywords: agency, staffing, consulting-only, competitor
- Company size under 50 employees

Target roles:
- VP of Sales
- Head of Sales
- Director of Sales
- Chief Revenue Officer
- Head of Revenue Operations
- Sales Operations Manager`;

const INDUSTRY_RE = /(insurance|insurtech|financ|fintech|bank|saas|software|tech|manufactur|healthcare|health|retail|energy|logistics|media|real estate|consulting|telecom|automotive|aerospace|education|travel|hospitality|food|chemical|pharma|biotech|construction|legal|marketing|cyber|security)/i;
const SIZE_RE = /(employees|employee|headcount|people|staff|seats)\s*(of|between|:)?\s*\d+|\d+\s*(-|–|to)\s*\d+|(sme|mid-market|enterprise|startup|scaleup)/i;
const COUNTRY_RE = /(united states|usa|u\.s\.|france|germany|uk|united kingdom|spain|italy|netherlands|belgium|switzerland|canada|australia|india|japan|china|brazil|mexico|poland|sweden|norway|denmark|finland|portugal|ireland|austria|singapore|uae|saudi|qatar|israel|turkey|vietnam|indonesia|nigeria|south africa|egypt|morocco|tunisia|algeria|europe|middle east|north america|latin america|asia|africa|gcc|emen|based in|located in|region of)/i;
const ROLE_RE = /(chief|head of|director|vp|vice president|manager|officer|lead|founder|cto|cio|cfo|cmo|coo|owner|hiring manager|decision maker|buyer|procurement|sales)/i;
const REVENUE_RE = /(annual revenue|arr|revenue|earnings)?\s*[:(-]?\s*\$?\s*\d[\d,]*(m|k|b|million|billion|bn)?(\s*(-|–|to|and|or)\s*\$?\s*\d[\d,]*(m|k|b|million|billion|bn)?)?/i;
const CITY_RE = /(preferred cities|based in|located in|headquartered|city)/i;
const TECH_RE = /(tech stack|technology stack|guidewire|salesforce|snowflake|aws|azure|gcp|tableau|slack|hubspot|sap|oracle|salesloft|outreach|zoominfo|segment|stripe|datadog|mixpanel|postgres|react|python|java|kafka|kubernetes)/i;
const GROWTH_RE = /(growth stage|growth-stage|startup|scaleup|hypergrowth|mature|late-stage|early-stage|bootstrapped)/i;
const FUNDING_RE = /(series [abcde]|series [abcde][+]|seed|venture|vc-backed|ipo|public|private equity|pe-backed)/i;
const EXCLUDE_RE = /(exclude|exclusion|except|do not target|avoid|never|blacklist|not in|outside of)/i;

const checks = [
  ["Industries", INDUSTRY_RE],
  ["Company size", SIZE_RE],
  ["Geography", COUNTRY_RE],
  ["Revenue / ARR", REVENUE_RE],
  ["Preferred cities", CITY_RE],
  ["Tech stack", TECH_RE],
  ["Growth stage", GROWTH_RE],
  ["Funding stage", FUNDING_RE],
  ["Exclusions", EXCLUDE_RE],
  ["Target roles", ROLE_RE],
];

let pass = 0;
for (const [label, re] of checks) {
  const ok = re.test(t);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${checks.length} hints fire on the example`);
process.exit(pass === checks.length ? 0 : 1);
