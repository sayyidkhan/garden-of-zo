export type ProjectOwnership = {
  category: "PAL" | "GOZ" | "GITHUB" | "GR" | "PERSONAL" | "STAKEFOLIO";
  subcategory: "PRODUCT" | "AGENT" | "WORKFLOW" | "SKILL" | "PLATFORM" | "GOVERNANCE" | "DATA" | "LEGACY" | "INFRASTRUCTURE" | "APP" | "MONITORING" | "WEBSITE" | "MAIL";
  status: "confirmed" | "proposed";
};

export const ownershipCategories: Record<ProjectOwnership["category"], string> = {
  PAL: "Kingdom of PAL projects",
  GOZ: "Garden of Zo projects",
  GITHUB: "Projects grouped under the workspace Github folder",
  GR: "GigRadar",
  PERSONAL: "Apps and tools built for the owner's own use",
  STAKEFOLIO: "Stakefolio portfolio projects and supporting services"
};

export const ownershipRoles: Record<ProjectOwnership["subcategory"], string> = {
  PRODUCT: "Standalone product or venture",
  AGENT: "Named AI agent, including planned agents",
  WORKFLOW: "Reusable automated research or processing workflow",
  SKILL: "Reusable method or instructions shared across agents",
  PLATFORM: "Shared application or coordination platform",
  GOVERNANCE: "Charter, policy or strategic direction",
  DATA: "Independent data service supporting a product",
  LEGACY: "Retired implementation retained for rollback/reference",
  INFRASTRUCTURE: "Routing, hosting, browser or database infrastructure",
  APP: "General application or utility",
  MONITORING: "Resource and operational visibility",
  WEBSITE: "Informational or public presentation website",
  MAIL: "GigRadar's mail application"
};

const groups: [ProjectOwnership["category"], ProjectOwnership["subcategory"], string[]][] = [
  ["PAL", "PRODUCT", ["stock-surfers"]],
  ["STAKEFOLIO", "PRODUCT", ["stakefolio", "stakefolio-studio", "stakefolio-staging", "shouldijoin", "shouldijoin-staging", "ideas-bank", "ideas-bank-review", "idea-backlog", "batam-100", "batam-100-site", "batam-100-staging", "saji-by-syam"]],
  ["STAKEFOLIO", "DATA", ["stakefolio-ledger", "stakefolio-ledger-data"]],
  ["PAL", "AGENT", ["orin", "orin-hermes-dashboard", "orin-hermes-gateway", "orin-websocket-bridge", "runa", "runa-hermes-dashboard", "runa-hermes-gateway", "runa-websocket-bridge", "bastion", "durik", "kensho", "kensho-reviewer", "riven", "riven-buildsmith", "riven-proj-tracker", "artifex", "agent-one", "rick", "scribe"]],
  ["PAL", "WORKFLOW", ["youtube-research", "pal-youtube-research", "socialmediawhisperer", "instagram-media-research"]],
  ["PAL", "SKILL", ["pal-skills-startup-validator"]],
  ["PAL", "PLATFORM", ["kingdom-of-pal", "sleeping-prince", "pal-agent-registry"]],
  ["PAL", "GOVERNANCE", ["pal-north-star"]],
  ["PAL", "LEGACY", ["pal-openclaw", "pal-agent-orin-openclaw-backup", "openclaw-dashboard"]],
  ["GOZ", "PLATFORM", ["zo-platform"]],
  ["GOZ", "INFRASTRUCTURE", ["zo-router", "public-apps", "private-apps", "zo-pocketbase", "kasm-browser"]],
  ["GOZ", "APP", ["zo-drive", "zotube", "zo-tube", "zo-moments", "zo-memories", "zo-backlog", "zo-order-tracker"]],
  ["GOZ", "MONITORING", ["zo-usage"]],
  ["GOZ", "WEBSITE", ["openzo"]],
  ["GITHUB", "APP", ["itachiscrow", "afterimage"]],
  ["GITHUB", "WEBSITE", ["longtaaborneo"]],
  ["GR", "MAIL", ["gigradar-mailhub", "gr-mailhub"]],
  ["PERSONAL", "APP", []]
];

const labels = new Map<string, ProjectOwnership>(groups.flatMap(([category, subcategory, ids]) =>
  ids.map(id => [id, { category, subcategory, status: "confirmed" }] as [string, ProjectOwnership])));
labels.set("zo-expert", { category: "GOZ", subcategory: "AGENT", status: "confirmed" });
labels.set("zo-relationship-mapper", { category: "GOZ", subcategory: "APP", status: "confirmed" });

export function categoryRoles(category: ProjectOwnership["category"]): ProjectOwnership["subcategory"][] {
  return [...new Set([
    ...groups.filter(group => group[0] === category).map(group => group[1]),
    ...[...labels.values()].filter(label => label.category === category).map(label => label.subcategory)
  ])];
}

export function projectOwnership(id: string): ProjectOwnership | undefined {
  return labels.get(id);
}

export function ownershipLabel(ownership: ProjectOwnership | undefined): string {
  return ownership ? `${ownership.category} | ${ownership.subcategory}${ownership.status === "proposed" ? " · Proposed" : ""}` : "Ownership pending";
}
