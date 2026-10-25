import { equalJson } from '@/lib/structural-sharing';
import { computeVision, withCreatureVision, type VisionMap } from './vision';

type Inputs = Parameters<typeof computeVision>;
const mapRules = (map: Inputs[0]) => ({
  id: map.id,
  width: map.width,
  height: map.height,
  vision_enabled: map.vision_enabled,
  scale_unit: map.scale_unit,
  scale_per_cell: map.scale_per_cell,
  lighting: map.lighting,
  darkness_level: map.darkness_level,
  day_darkness_level: map.day_darkness_level,
  darkness_regions: map.darkness_regions,
});
const opaqueZones = (zones: Inputs[6]) =>
  (zones ?? [])
    .filter((z) => z.opaque || z.darkness)
    .map((z) => ({ cells: z.cells, opaque: z.opaque, darkness: z.darkness }));

/** One immutable result per mounted map/user. Actions and HP changes that do not
 * change sight must not recast every ray or rebuild the GPU visibility mask. */
export function createVisionComputer() {
  let previous: {
    inputs: Inputs;
    rules: ReturnType<typeof mapRules>;
    zones: ReturnType<typeof opaqueZones>;
    view: VisionMap;
  } | null = null;
  let decorated: VisionMap | undefined;
  return {
    compute(...inputs: Inputs): VisionMap {
      const [map, cells, objects, fog, lights, observers, zones] = inputs;
      const rules = mapRules(map),
        obstructionZones = opaqueZones(zones);
      if (
        previous &&
        previous.inputs[1] === cells &&
        previous.inputs[2] === objects &&
        previous.inputs[3] === fog &&
        equalJson(previous.rules, rules) &&
        equalJson(previous.inputs[4], lights) &&
        equalJson(previous.inputs[5], observers) &&
        equalJson(previous.zones, obstructionZones)
      )
        return previous.view;
      const view = computeVision(...inputs);
      previous = { inputs, rules, zones: obstructionZones, view };
      return view;
    },
    creatures(...inputs: Parameters<typeof withCreatureVision>): VisionMap {
      const next = withCreatureVision(...inputs);
      if (
        decorated &&
        decorated.visible === next.visible &&
        equalJson(decorated.hiddenTokenIds, next.hiddenTokenIds)
      )
        return decorated;
      decorated = next;
      return next;
    },
  };
}
