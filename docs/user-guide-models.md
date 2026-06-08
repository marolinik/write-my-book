# Model Selection Guide

Write My Book gives you fine-grained control over which AI model is used for each task. You can set defaults globally, override them per book, and even assign different models to different agent roles.

## How Model Selection Works

When you start a workflow, Write My Book resolves which model to use through a **4-level resolution chain**. Each level overrides the one below it:

| Priority | Level | Description | Example |
|----------|-------|-------------|---------|
| 1 (highest) | **Book role override** | A specific model for a specific role in one book | "Use Opus for dev-editing on my fantasy novel" |
| 2 | **Book default** | A default model for all roles in one book | "Use Sonnet for everything on this book" |
| 3 | **Global role override** | A specific model for a specific role across all books | "Always use Opus for dev-editing" |
| 4 (lowest) | **Global default** | Your fallback model for everything | "Use Sonnet for everything" |

The resolver walks from level 1 to level 4 and uses the **first valid model** it finds. Most users only need level 4 (a global default). Power users can fine-tune at any level.

## Agent Roles

Write My Book groups its 14 agent types into 6 functional roles for model selection:

| Role | Agent Types | Typical Use |
|------|-------------|-------------|
| **Ghostwriter** | Ghostwriter | Writing and rewriting chapters |
| **Editor** | Dev Editor, Line Editor | Structural and line-level editing |
| **Beta Reader** | Beta Reader | Feedback and scoring |
| **Analyst** | Style Analyst, Manuscript Analyst, Continuity Checker, Manuscript Reader, World Researcher, Market Reader, Publishing Editor | Analysis and research |
| **Coach** | Writing Coach | Guidance and orchestration |
| **Creative** | Story Architect, Scene Planner | Plot and scene design |

## Setting Global Defaults

1. Go to **Settings > Model Selection**
2. Choose your **default model** -- this is used for all agent roles unless overridden
3. Optionally, expand **Role Overrides** to assign different models to specific roles
4. The **resolution preview** at the bottom shows which model each role will actually use

**Example:** Set Sonnet as your global default, but override the Editor role to use Opus for higher-quality structural feedback.

## Setting Per-Book Overrides

1. Open a book and go to **Book Settings > Model Overrides**
2. Choose a **book default model** to override the global default for this book
3. Optionally, set role-specific overrides that apply only to this book
4. The **resolution preview** shows the effective model for each role, accounting for all levels

**Example:** Your 200,000-word fantasy epic uses Opus for world-building (Creative role) while your short story collection uses the cheaper global defaults.

## Cost Implications

Different models have different costs per token. The platform uses three cost tiers:

| Tier | Cost Range (output/1M tokens) | Examples |
|------|-------------------------------|----------|
| **$** (Budget) | Under $2 | Haiku 4.5, GPT-4o Mini, Gemini 2.0 Flash, MiniMax M2.5 |
| **$$** (Standard) | $2 - $20 | Sonnet 4.5, GPT-4o, Gemini 2.5 Pro, Grok-3, o4-mini |
| **$$$** (Premium) | Over $20 | Opus 4.6, o3 |

**Before you start any workflow**, the card shows an estimated cost based on the model that will be used and the workflow's expected token usage. Use this to make informed decisions about which model to assign.

**General guidance:**
- **Quick tasks** (line editing, beta reading) work well with budget or standard models
- **Complex tasks** (architecture building, dev editing, style capture) benefit from premium models
- **Analysis tasks** (continuity checking, market research) are fine with standard models

## Minimum Tier Requirements

Some workflows require a minimum model capability tier to produce quality results:

| Minimum Tier | Workflows |
|-------------|-----------|
| **Sonnet** | Plan Chapter, Write Chapter, Dev Edit, Line Edit, Beta Read, Revise, Build Architecture, Refresh Style, Evolve Style, Market Analysis, Publishing Check |
| **Haiku** | Read Manuscript, Capture Style, Continuity Check, and other lightweight tasks |

If your selected model does not meet the minimum tier for a workflow, the **UI prevents you from starting it** and shows which tier is required. You will need to either change your model settings or select a different model for that role.

## Resolution Preview

Both the global settings page and per-book settings page include a **resolution preview**. This table shows, for each of the 6 agent roles:

- Which model will actually be used
- Which level of the chain it resolved from
- The cost tier of that model

This makes it easy to verify your configuration before starting any workflow. If a role shows an unexpected model, you can trace it back to whichever level is providing the override.

## Quick Recommendations

| Use Case | Recommended Setup |
|----------|------------------|
| **Budget-conscious** | Global default: Gemini 2.5 Flash or Haiku 4.5 |
| **Balanced quality/cost** | Global default: Sonnet 4.5, upgrade Editor to Opus for important books |
| **Maximum quality** | Global default: Opus 4.6 (be aware of costs on long manuscripts) |
| **Experimenting** | Use OpenRouter key, try different models per role to compare results |
