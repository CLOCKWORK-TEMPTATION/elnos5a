export { INTERNAL_TO_EXTERNAL_BAND } from "@/suspicion-engine/types";
export type {
  InternalResolutionRoute,
  SuspicionBand,
} from "@/suspicion-engine/types";

import { INTERNAL_TO_EXTERNAL_BAND } from "@/suspicion-engine/types";
import type {
  InternalResolutionRoute,
  SuspicionBand,
} from "@/suspicion-engine/types";

export function toExternalBand(route: InternalResolutionRoute): SuspicionBand {
  return INTERNAL_TO_EXTERNAL_BAND[route];
}
