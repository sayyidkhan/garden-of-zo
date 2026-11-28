# Project label legend

Recorded: 17 October 2026. This is the canonical reference for workspace project ownership and role labels. The category/sub-category format and mapping below were reviewed in chat. On 22 October 2026, the owner confirmed GOZ ownership for Zo Expert and Relationship Mapper and requested removal of their Proposed markers.

On 22 October 2026, the owner introduced STAKEFOLIO as a separate main category for Stakefolio portfolio projects. The current provider lists Should I Join, Ideas Bank, Batam 100 and SAJI by Syam. Stakefolio itself and its supporting data service also use this category; Stock Surfers retains PAL ownership because it is not in the current Stakefolio portfolio.

On 5 November 2026, the owner confirmed Stakefolio itself as an ownership and governance ledger. Stakefolio, its studio and its Web/Backend services use `STAKEFOLIO | GOVERNANCE`; its portfolio ventures retain `STAKEFOLIO | PRODUCT`. This supersedes Stakefolio's former PRODUCT label and its backend's former DATA label.

## Format and meaning

Use three columns: **Category | Sub-category | Projects**. A combined label is written `PAL | AGENT`. Category identifies the owning group; sub-category identifies the project's role. Use uppercase, singular sub-categories and no `-APPS` suffix on category names.

| Category | Meaning | Folder convention |
|---|---|---|
| PAL | Kingdom of PAL projects | `Start/pal/` |
| GOZ | Garden of Zo projects | `Start/garden-of-zo/` |
| GITHUB | Existing ownership group for Afterimage, Itachi's Crow and Long Taa Borneo | `hackathon/` (direct project folders) |
| GR | GigRadar | Intended `gr/`; currently `Start/gigradarapp/` |
| PERSONAL | Apps and tools built for the owner's own use | Suggested `Start/personal/`; not yet created |
| STAKEFOLIO | Stakefolio portfolio projects and supporting services | Currently `Start/pal/pal-projects/`; no folder move |
| SYSTEM | Shared computer services and temporary working files | Existing system and conversation workspace locations; no folder move |

GITHUB retains the existing ownership group formerly stored under `Github/`; these three hackathon projects now live directly under `hackathon/`. This folder move does not reclassify their labels. A GitHub repository alone does not establish GITHUB ownership. Hosting an app through Garden does not transfer its ownership to GOZ.

| Sub-category | Meaning |
|---|---|
| PRODUCT | Standalone product or venture |
| AGENT | Named AI agent, including planned agents |
| WORKFLOW | Reusable automated research or processing workflow |
| SKILL | Reusable method or instructions shared across agents |
| PLATFORM | Shared application or coordination platform |
| GOVERNANCE | Ownership and decision records, charters, policy or strategic direction |
| DATA | Independent data service supporting a product |
| LEGACY | Retired implementation retained for rollback/reference |
| INFRASTRUCTURE | Routing, hosting, browser or database infrastructure |
| APP | General application or utility |
| MONITORING | Resource and operational visibility |
| WEBSITE | Informational or public presentation website |
| MAIL | GigRadar's mail application |
| RUNTIME | Shared software state used by computer tools and agent frameworks |
| TEMPORARY | Temporary working files created during development or conversations |

## Project mapping

| Category | Sub-category | Projects |
|---|---|---|
| PAL | PRODUCT | Stock Surfers |
| STAKEFOLIO | PRODUCT | Should I Join, Ideas Bank, Batam 100 Itinerary, SAJI by Syam |
| STAKEFOLIO | GOVERNANCE | Stakefolio — ownership and governance ledger, including its studio and Web/Backend components |
| PAL | AGENT | Orin, Runa, Bastion, Durik, Kensho, Riven, Artifex, Agent One, Rick, Scribe |
| PAL | WORKFLOW | YouTube Research, Social Media Whisperer |
| PAL | SKILL | Startup Validator |
| PAL | PLATFORM | Kingdom of PAL, Sleeping Prince |
| PAL | GOVERNANCE | PAL North Star |
| PAL | LEGACY | PAL OpenClaw, Orin OpenClaw backup |
| GOZ | PLATFORM | Zo Platform — Garden homepage, Atlas, catalogue and private inventory |
| GOZ | INFRASTRUCTURE | Zo Router, PocketBase, Kasm Browser, Tailscale |
| GOZ | APP | Zo Drive, Zo Tube, Zo Moments, Zo Backlog, zorder |
| GOZ | MONITORING | Zo Usage |
| GOZ | WEBSITE | OpenZo |
| GOZ | AGENT | Zo Expert |
| GOZ | APP | Relationship Mapper |
| GITHUB | APP | Itachi's Crow, Afterimage |
| GITHUB | WEBSITE | Long Taa Borneo |
| GR | MAIL | GigRadar MailHub |
| PERSONAL | APP | Personal budgeting app — planned; not yet created |
| SYSTEM | RUNTIME | Shared computer tools and agent framework state |
| SYSTEM | TEMPORARY | Conversation scratch and development working files |

## Folder names, aliases and supporting services

- Existing PAL and STAKEFOLIO source checkouts remain under `Start/pal/pal-projects/`. Ideas Bank uses `idea-backlog`; Should I Join uses `shouldijoin`; Stock Surfers uses `stock-surfers`; Batam 100 Itinerary uses `batam-100-site` and its Stakefolio record uses `batam-100`. SAJI by Syam uses Stakefolio record slug `saji-by-syam`; no separate hosted checkout is established by this classification.
- PAL agents use `Start/pal/pal-agent-*/`. Artifex, Agent One, Rick and Scribe belong to AGENT even if their implementation is incomplete. An ownership label does not assert that an agent is running.
- PAL workflows use `pal-workflow-youtuberesearch` and `pal-workflow-socialmediawhisperer`. Kingdom of PAL, Sleeping Prince and PAL North Star use `kingdom-of-pal`, `sleeping-prince` and `pal-north-star` respectively.
- Social Media Whisperer's existing services `pal-omnigent-server` and `pal-omnigent-host` inherit `PAL | WORKFLOW` and link to registered workflow `instagram-media-research`. Garden displays them as **Social Media Whisperer — Coordinator** and **Social Media Whisperer — Worker**, retaining their technical service names in details and their stable inventory IDs.
- Shared PAL method packages use `Start/pal/pal-skills-*/`; Startup Validator uses `pal-skills-startup-validator`, registered in Kingdom as a portable skill for all registered agents. Runtime skill-directory links are supporting artefacts, not extra projects.
- Stakefolio uses `stakefolio`; its studio, web service `stakefolio-staging` and backend service `stakefolio-ledger-data` inherit `STAKEFOLIO | GOVERNANCE` as components of one ledger project. Garden displays the services as **Stakefolio — Web** and **Stakefolio — Backend**, retaining technical names in details and stable inventory IDs. Both catalogue destinations link to the backend; the web service also records its backend API dependency. Backend code lives inside `stakefolio/backend/` with ignored data in `stakefolio/stakefolio-ledger/`.
- Retained OpenClaw source uses `pal-openclaw` and `pal-agent-orin-openclaw-backup`. These labels do not authorise reactivating retired services or changing rollback state.
- Garden uses `zo-platform`; routing uses the independent `zo-router` checkout. zorder uses `zo-order-tracker`, Zo Moments uses `zo-memories`, Zo Tube uses `zo-tube`, and Kasm Browser uses `kasm-browser`.
- Tailscale (`tailscale`) is owner-confirmed Garden shared networking infrastructure (`GOZ | INFRASTRUCTURE`, 10 November 2026). Private inventory records its Garden project mapping for tracking, independently of app/agent/workflow dependencies. This classification does not change Tailscale networking or its retained legacy proxy configuration.
- Zo Expert and Relationship Mapper currently live under `hackathon/suphackathon2026/zo-expert` and `hackathon/suphackathon2026/zo-relationship-mapper`. Their confirmed GOZ ownership does not imply that their folders have moved.
- GITHUB projects use `hackathon/itachiscrow`, `hackathon/afterimage` and `hackathon/longtaaborneo`, directly alongside `suphackathon2026/`. The owner confirmed all three are hackathon projects; their existing ownership labels remain unchanged.
- GigRadar MailHub currently uses `Start/gigradarapp/`. `gr/` is the requested folder convention; relocation is not part of recording this legend.
- Services inherit their owning project's label: Orin and Runa dashboard/gateway services use `PAL | AGENT`; public/private Garden gateways use `GOZ | INFRASTRUCTURE`; the platform process uses `GOZ | PLATFORM`. Riven's tracker belongs to the Riven agent.
- Orin database records use one owner, **Orin Forgekeeper** (`agent:orin`). The separate **Component** field distinguishes **Agent Runtime** (Orin's Hermes profile) from **Agent Dashboard** (records discovered under `orin-hermes-dashboard`). The dashboard service remains linked in details; technical service identifiers, backup creators and filenames stay separate from ownership. Component labels describe the recorded association, not exclusive access by that component.
- Runtime data directories, backups, generated output and compatibility links are supporting artefacts, not additional apps. Their ownership follows the related project; access and retention rules remain separate.
- Garden database snapshots inherit the source project only through a checksum-verified backup manifest. Native `/root/.hermes/backups/orin/` and `/root/.hermes/backups/runa/` copies inherit their respective agent. Root Codex databases and shared Hermes stores (`shared-state.db`, `kanban.db`, `state.db` directly under `/root/.hermes/`) use `SYSTEM | RUNTIME`. Zo conversation scratch databases use `SYSTEM | TEMPORARY`. These are shared system records, not additional projects or an individual agent’s databases. Orin and Runa profile databases retain `PAL | AGENT`. The owner approved SYSTEM and its two roles on 27 November 2026.
- Private inventory maps the exact live database paths `Start/pal/kingdom-of-pal/state/pal-registry.sqlite3` to the Kingdom registry service (`PAL | PLATFORM`), `Start/pal/pal-agent-bastion/var/bastion.db` to Bastion (`PAL | AGENT`), and `Start/garden-of-zo/zo-order-tracker/zorder-data/zorder.sqlite` to zorder's service (`GOZ | APP`). These owner-confirmed mappings (10 November 2026) do not apply to same-named files elsewhere or change database contents.

## Maintenance and implementation status

The live Ideas Bank staging database at `Start/pal/pal-projects/idea-backlog/.data/ideas-bank.sqlite3` belongs to the **Ideas Bank** app (`STAKEFOLIO | PRODUCT`) and displays as **Ideas & Memories**. Its service's database setting and open handle confirm use. The private `.data/` directory is ignored by Git and independent of Riven's disposable review folders. This exact-path mapping does not apply to Riven review databases.

Update this document when a project is added or reclassified. Keep workspace and platform AGENTS.md pointers directed here instead of duplicating the table. Record unresolved ownership explicitly before applying it to catalogue or inventory metadata.

Use the [Garden Project Labels skill](../skills/garden-project-labels/SKILL.md) for classification, reviews and ownership metadata updates. It is maintained in this repository and linked from workspace `Skills/garden-project-labels`. The skill defines the workflow; this document remains the canonical legend and mapping.

Garden displays these labels in public/private List entries and Atlas details. `../project-labels.ts` maintains the corresponding identifier mapping, including aliases and confirmation status; update it alongside this legend. All current catalogue ownership labels are confirmed. Private inventory labels known apps, agents, services and workflows, with “Ownership pending” for unmapped records. Public output includes only ownership for already catalogued destinations, never the full private inventory or project registry. Both catalogues provide category/sub-category filters in List and Atlas; selections persist in the URL, combine with other filters and can be cleared independently. Sub-category choices follow this mapping. Categories without matching destinations show an empty state.

Both catalogues provide a **Label legend** button beside the List/Atlas view and filter controls. Its dialog explains the categories, roles and pending status without exposing the project registry or private operational details. Definitions in `project-labels.ts` are checked against this document by the platform tests.

Labels do not move folders, rename services, change routes, alter visibility or change repository remotes. Existing catalogue display categories such as Commerce and Insight remain separate from ownership.
