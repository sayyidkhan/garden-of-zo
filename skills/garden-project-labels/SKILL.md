---
name: garden-project-labels
description: Standardise Garden of Zo project ownership labels, classify new projects and supporting services, audit existing mappings, and maintain the canonical category and sub-category legend. Use when reviewing or updating PAL, GOZ, GITHUB, GR or PERSONAL project labels.
metadata:
  author: sayyidkhan.zo.computer
  display-name: Garden Project Labels
---

# Garden project labels

Maintain consistent ownership and role labels across Garden's project legend and, when requested, its catalogue and private inventory.

This skill is maintained in the Garden platform repository at `skills/garden-project-labels/SKILL.md`. Workspace `/home/workspace/Skills/garden-project-labels` links to that directory so edits use the same versioned source.

## Read first

Read the current canonical legend at `/home/workspace/Start/garden-of-zo/zo-platform/docs/project-labels.md`. It owns the category definitions, allowed roles, project mapping, aliases and pending decisions. Reference it rather than copying its full mapping into this skill.

Read `/home/workspace/Start/garden-of-zo/zo-platform/README.md` and `AGENTS.md` before editing that project. For a new or ambiguous project, inspect its own README and applicable AGENTS.md plus its actual folder and repository identity. The latest explicit owner decision takes precedence over an older mapping; update the legend accordingly within the requested scope.

## Classify projects

- Present reviews as `Category | Sub-category | Projects`. Combined labels use `PAL | AGENT` syntax.
- Use categories `PAL`, `GOZ`, `GITHUB`, `GR` and `PERSONAL`, with uppercase singular roles from the legend, such as `PRODUCT`, `AGENT` and `WORKFLOW`. Do not restore the `-APPS` suffix or plural `AGENTS`.
- Classify by ownership and purpose. Garden hosting alone does not imply GOZ ownership; a GitHub remote alone does not imply GITHUB ownership. GITHUB is the workspace folder grouping.
- Artifex, Agent One, Rick and Scribe are agents even when planned or incomplete. Classification does not establish runtime health or deployment.
- Treat services as belonging to their owning project. Resolve relationships from the legend and current configuration; for example, Project Ledger Service supports Stakefolio but retains `PAL | DATA`.
- Count compatibility aliases, runtime data, backups and generated files as supporting artefacts rather than additional projects. Preserve current and intended folder distinctions, including GR's intended `gr/` convention.
- Keep unresolved ownership explicitly proposed or pending. Do not silently promote pending entries into confirmed metadata. If evidence leaves a material ownership choice unresolved, present the candidate label and ask one focused question while completing other classifications.

## Apply the requested scope

For a review, report the mapping and discrepancies without modifying projects. For an authorised addition or reclassification, update the canonical legend and keep workspace/project guidance as pointers rather than duplicate tables. Record aliases, supporting services and outstanding ownership choices where relevant.

The legend currently records ownership; it does not by itself implement Garden labels or filters. Inspect the current implementation before claiming labels appear in the interface. When the user requests catalogue or inventory implementation:

- Keep ownership category/sub-category separate from existing presentation categories, `kind`, access levels and service identifiers. Do not repurpose a field such as Commerce or Insight to store ownership.
- Keep presentation and inventory changes in `/home/workspace/Start/garden-of-zo/zo-platform` (repository `sayyidkhan/garden-of-zo`). `/home/workspace/Start/garden-of-zo/zo-router` is independent routing infrastructure (repository `sayyidkhan/zo-router`). Labels do not belong in forwarding manifests merely to display them.
- Preserve public/private boundaries and exclude private operational details from public output. Classification does not authorise folder moves, service renames, route changes, visibility changes or reactivation of legacy services.
- For code changes run the platform's documented checks and verify affected rendering and access behaviour. If deploying an authorised platform change, restart only `zo-platform`; a documentation-only update needs no restart.

Before handoff, check spelling/case, role validity against the legend, aliases, pending status and the owning project of affected services. State what was updated, whether interface labels were implemented, and whether changes are local or committed/pushed. Commit or push only within the user's authorised scope.
