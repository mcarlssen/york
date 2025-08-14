# Master Game Design Document (GDD)

## 1. Overview
A text-based adventure RPG inspired by classic parser games (like *Zork*), but with modern extensibility and modularity. Designed for web and potentially other platforms, this MVP focuses on a **parser-first input system** with optional natural language interpretation.

---

## 2. Core Goals
- **Maintainability:** Rules and world content are easily editable by non-programmers.
- **Extensibility:** Modular world files and systems so content can grow without code changes.
- **Security & Control:** Avoid excessive black-box AI behavior that could allow exploits or break immersion.
- **Accessibility:** Runs in-browser with minimal requirements; no heavy client install.

---

## 3. Gameplay Loop
1. Player reads narrative description of their current location, situation, and available choices.
2. Player enters an action (parser command, e.g., `go north`, `pick up sword`, or `talk guard`).
3. Game processes action, applies mechanics, updates world state, and outputs results.
4. Repeat.

---

## 4. Player Input System
### MVP
- **Parser-first**: Defined command verbs, objects, and syntax.
- **NLU (Natural Language Understanding) on tap**: Optional mode to interpret freeform input into parser commands.
- **Fallbacks**: Unknown commands trigger helpful prompts or “I don’t understand” responses.

**Rationale:**  
Parser-first ensures predictability, security, and testability. NLU can be layered later for richer player freedom without risking prompt injection or inconsistent rules.

---

## 5. World Model
- **Regions** contain **Locations** (rooms, outdoor areas, etc.).
- Locations have:
  - Name & description
  - Connections to other locations
  - Items, NPCs, and interactive elements
  - Optional scripted events
- Regions may have unique environmental effects or rules.

---

## 6. Narrative Structure
- World content is stored as **external asset files** in structured JSON or YAML.
- Narrative text is written to allow light variation, so the game can feel fresh.
- Optional **in-world ads** (à la Fallout’s fictional commercials) may be integrated for story flavor.

---

## 7. Systems & Mechanics
- **Inventory System** — items with properties, usage rules, and effects.
- **NPCs** — interactive agents with scripted behaviors.
- **Combat (future)** — turn-based or simple resolution mechanic.
- **Events** — triggers that change the world state.
- **State Persistence** — server stores player progress.

---

## 8. Technical Notes
- **Connectivity**: MVP assumes persistent online access; eventual offline resilience possible.
- **Anti-Cheat**: MVP ignores anti-cheat; future logging of player actions for analysis.
- **Testing**: Unit tests + scripted playthroughs to validate logic; debug mode for forced outcomes.

---

## 9. Security
- Commands validated against parser rules.
- No raw LLM output directly altering game state without rules mediation.
- Future: sandbox scripting for content creators.

---

## 10. MVP Scope
- Small but complete world (3–5 regions, 10–15 locations).
- Parser-first with minimal natural language handling.
- Core mechanics: movement, inventory, simple NPC interaction, basic events.

---

## Appendix A: Key Design Decisions & Rationale
- **Parser-first input**: chosen for predictability, maintainability, and avoiding AI unpredictability.
- **NLU optional mode**: allows flexibility without compromising MVP stability.
- **Structured world files**: enables both humans and AI agents to create content.
- **In-world ads**: narrative tool, not core mechanic (not implemented in MVP).
- **Persistent connectivity assumed**: simplifies MVP architecture.
- **Testing via scripted playthroughs**: ensures mechanics behave as intended.
