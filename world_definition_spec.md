# World Definition Specification

## Purpose
This document defines the structure, required fields, and design rules for creating a world asset usable in the game.
It is intended to be used by both human designers and automated agents to ensure consistency, validity, and integration into the game's backend.

---

## High-Level Overview
A world in this game consists of:
- **World Metadata** – Basic information like name, ID, version, and description.
- **Regions** – Large-scale zones or areas within the world.
- **Locations** – Specific, explorable points within regions.
- **Connections** – Navigable paths between locations.
- **Points of Interest (POI)** – Narrative or interactive elements inside locations.
- **Resource Spawns** – Items, materials, or collectibles available in the world.
- **World Rules** – Constraints, environmental factors, and gameplay modifiers.

---

## File Format
- **Type:** JSON
- **Encoding:** UTF-8
- **Naming Convention:** `world_<worldname>_v<version>.json` (e.g., `world_elyria_v1.json`)
- **Validation:** Must pass schema validation before import.

---

## JSON Structure

```json
{
  "world_id": "elyria",
  "version": "1.0",
  "name": "Elyria",
  "description": "A lush fantasy realm split between verdant valleys and ancient ruins.",
  "regions": [
    {
      "region_id": "valley_of_echoes",
      "name": "Valley of Echoes",
      "description": "Rolling hills and mysterious caves.",
      "locations": [
        {
          "location_id": "misty_meadow",
          "name": "Misty Meadow",
          "description": "A fog-covered meadow filled with rare herbs.",
          "coordinates": { "x": 125, "y": 340 },
          "connections": [
            { "to": "whispering_cave", "type": "path", "difficulty": "easy" }
          ],
          "points_of_interest": [
            {
              "poi_id": "ancient_stone",
              "name": "Ancient Stone",
              "type": "lore",
              "description": "A carved stone that hints at lost civilizations."
            }
          ],
          "resource_spawns": [
            {
              "resource_id": "herb_silverleaf",
              "spawn_rate": "rare",
              "quantity_range": [1, 3]
            }
          ]
        }
      ]
    }
  ],
  "world_rules": {
    "gravity": 9.8,
    "day_length_minutes": 60,
    "weather_patterns": ["sunny", "rain", "fog"],
    "fast_travel_enabled": true
  }
}
```

---

## Field Definitions

### World-Level Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `world_id` | string | ✅ | Unique identifier for the world. |
| `version` | string | ✅ | Version number of the file. |
| `name` | string | ✅ | Display name of the world. |
| `description` | string | ✅ | Overview of the world’s theme and tone. |
| `regions` | array | ✅ | List of major zones. |
| `world_rules` | object | ✅ | Game mechanic rules affecting the whole world. |

### Region Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `region_id` | string | ✅ | Unique identifier for the region. |
| `name` | string | ✅ | Display name of the region. |
| `description` | string | ✅ | Narrative description. |
| `locations` | array | ✅ | List of locations in the region. |

### Location Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `location_id` | string | ✅ | Unique identifier for the location. |
| `name` | string | ✅ | Name displayed in-game. |
| `description` | string | ✅ | Narrative/environmental description. |
| `coordinates` | object | ✅ | `{x, y}` position in the region. |
| `connections` | array | ❌ | Paths leading to other locations. |
| `points_of_interest` | array | ❌ | Narrative or interactive objects. |
| `resource_spawns` | array | ❌ | List of resources available. |

### Points of Interest Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `poi_id` | string | ✅ | Unique identifier. |
| `name` | string | ✅ | Name of the POI. |
| `type` | string | ✅ | Type: `lore`, `quest`, `scenery`, etc. |
| `description` | string | ✅ | Narrative description. |

### Resource Spawn Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resource_id` | string | ✅ | Unique identifier for resource. |
| `spawn_rate` | string | ✅ | Frequency: `common`, `uncommon`, `rare`, etc. |
| `quantity_range` | array[int,int] | ✅ | Min and max spawn count. |

---

## Design Guidelines
1. **Unique IDs** – All IDs must be unique across the world file.
2. **Connected World** – Locations must form a traversable network; no isolated nodes.
3. **Scalability** – Regions should be modular to allow expansion in later updates.
4. **Balanced Resources** – Ensure resource spawn rates align with gameplay economy.
5. **Lore Consistency** – POIs and descriptions must match overall narrative tone.
6. **Testing Hooks** – Include at least one test POI and resource per region for QA.

---

## Validation Rules
- The file **must** pass JSON schema validation before being accepted into the backend.
- All references (`connections.to`, `resource_id`, etc.) must point to valid existing IDs.
- Coordinates must be integers within a defined map boundary (configurable per world).

---

## Example File
See included `sample_world_elyria.json` for an example of a valid world definition file.
