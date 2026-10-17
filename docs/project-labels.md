# Project label legend

Recorded: 17 October 2026. This is the canonical reference for workspace project ownership and role labels. The category/sub-category format and mapping below were reviewed in chat; the two entries explicitly marked proposed remain pending ownership confirmation.

## Format and meaning

Use three columns: **Category | Sub-category | Projects**. A combined label is written `PAL | AGENT`. Category identifies the owning group; sub-category identifies the project's role. Use uppercase, singular sub-categories and no `-APPS` suffix on category names.

| Category | Meaning | Folder convention |
|---|---|---|
| PAL | Kingdom of PAL projects | `Start/pal/` |
| GOZ | Garden of Zo projects | `Start/garden-of-zo/` |
| GITHUB | Projects grouped under the workspace Github folder | `Github/` |
| GR | GigRadar | Intended `gr/`; currently `Start/gigradarapp/` |
| PERSONAL | Apps and tools built for the owner's own use | Suggested `Start/personal/`; not yet created |

GITHUB refers to the workspace grouping, not every project with a GitHub repository. Hosting an app through Garden does not transfer its ownership to GOZ.

| Sub-category | Meaning |
|---|---|
| PRODUCT | Standalone product or venture |
| AGENT | Named AI agent, including planned agents |
| WORKFLOW | Reusable automated research or processing workflow |
| PLATFORM | Shared application or coordination platform |
| GOVERNANCE | Charter, policy or strategic direction |
| DATA | Independent data service supporting a product |
| LEGACY | Retired implementation retained for rollback/reference |
| INFRASTRUCTURE | Routing, hosting, browser or database infrastructure |
| APP | General application or utility |
| MONITORING | Resource and operational visibility |
| WEBSITE | Informational or public presentation website |
| MAIL | GigRadar's mail application |

## Project mapping

| Category | Sub-category | Projects |
|---|---|---|
| PAL | PRODUCT | Stakefolio, Should I Join, Ideas Bank, Stock Surfers, Batam 100 Itinerary |
| PAL | AGENT | Orin, Runa, Bastion, Durik, Kensho, Riven, Artifex, Agent One, Rick, Scribe |
| PAL | WORKFLOW | YouTube Research, Social Media Whisperer |
| PAL | PLATFORM | Kingdom of PAL, Sleeping Prince |
| PAL | GOVERNANCE | PAL North Star |
| PAL | DATA | Project Ledger Service — Stakefolio's backend |
| PAL | LEGACY | PAL OpenClaw, Orin OpenClaw backup |
| GOZ | PLATFORM | Zo Platform — Garden homepage, Atlas, catalogue and private inventory |
| GOZ | INFRASTRUCTURE | Zo Router, PocketBase, Kasm Browser |
| GOZ | APP | Zo Drive, Zo Tube, Zo Moments, Zo Backlog, zorder |
| GOZ | MONITORING | Zo Usage |
| GOZ | WEBSITE | OpenZo |
| GOZ | AGENT | Zo Expert — proposed; ownership pending |
| GOZ | APP | Relationship Mapper — proposed; ownership pending |
| GITHUB | APP | Itachi's Crow, Afterimage |
| GITHUB | WEBSITE | Long Taa Borneo |
| GR | MAIL | GigRadar MailHub |
| PERSONAL | APP | Personal budgeting app — planned; not yet created |

## Folder names, aliases and supporting services

- PAL products live under `Start/pal/pal-projects/`. Ideas Bank uses `idea-backlog`; Should I Join uses `shouldijoin`; Stock Surfers uses `stock-surfers`; Batam 100 Itinerary uses `batam-100-site`.
- PAL agents use `Start/pal/pal-agent-*/`. Artifex, Agent One, Rick and Scribe belong to AGENT even if their implementation is incomplete. An ownership label does not assert that an agent is running.
- PAL workflows use `pal-workflow-youtuberesearch` and `pal-workflow-socialmediawhisperer`. Kingdom of PAL, Sleeping Prince and PAL North Star use `kingdom-of-pal`, `sleeping-prince` and `pal-north-star` respectively.
- Stakefolio uses `stakefolio`; `tampalidea` is a compatibility alias, not an additional product. Project Ledger Service uses `project-ledger-service`; its managed service `project-ledger-data` inherits `PAL | DATA` and supports Stakefolio.
- Retained OpenClaw source uses `pal-openclaw` and `pal-agent-orin-openclaw-backup`. These labels do not authorise reactivating retired services or changing rollback state.
- Garden uses `zo-platform`; routing uses the independent `zo-router` checkout. zorder uses `zo-order-tracker`, Zo Moments uses `zo-memories`, Zo Tube uses `zo-tube`, and Kasm Browser uses `kasm-browser`.
- Zo Expert and Relationship Mapper currently live under `hackathon/suphackathon2026/zo-expert` and `hackathon/suphackathon2026/zo-relationship-mapper`. Their proposed GOZ ownership does not imply that their folders have moved.
- GITHUB projects use `Github/itachiscrow`, `Github/afterimage` and `Github/longtaaborneo`.
- GigRadar MailHub currently uses `Start/gigradarapp/`. `gr/` is the requested folder convention; relocation is not part of recording this legend.
- Services inherit their owning project's label: Orin and Runa dashboard/gateway services use `PAL | AGENT`; public/private Garden gateways use `GOZ | INFRASTRUCTURE`; the platform process uses `GOZ | PLATFORM`. Riven's tracker belongs to the Riven agent.
- Runtime data directories, backups, generated output and compatibility links are supporting artefacts, not additional apps. Their ownership follows the related project; access and retention rules remain separate.

## Maintenance and implementation status

Update this document when a project is added or reclassified. Keep workspace and platform AGENTS.md pointers directed here instead of duplicating the table. Record unresolved ownership explicitly before applying it to catalogue or inventory metadata.

Use the [Garden Project Labels skill](../skills/garden-project-labels/SKILL.md) for classification, reviews and ownership metadata updates. It is maintained in this repository and linked from workspace `Skills/garden-project-labels`. The skill defines the workflow; this document remains the canonical legend and mapping.

This records the legend only. It does not implement Garden labels or filters, move folders, rename services, change routes, alter visibility or change repository remotes. Existing catalogue display categories such as Commerce and Insight are separate from this ownership legend; implementation should preserve that distinction.
