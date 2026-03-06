import { useCallback, useRef, type MutableRefObject } from "react";
import type { EditorArea } from "../components/editor";
import { isElementType } from "../extensions/classification-types";
import {
  isInsertActionId,
  runInsertMenuAction,
  type MenuToastPayload,
} from "../controllers";

export const useMenuCommandResolver = (
  areaRef: MutableRefObject<EditorArea | null>,
  toast: (payload: MenuToastPayload) => void
) => {
  const photoMontageCounterRef = useRef(1);

  return useCallback(
    (actionId: string): boolean => {
      const area = areaRef.current;
      if (!area) return false;

      if (actionId.startsWith("format:")) {
        const maybeFormat = actionId.replace("format:", "");
        if (isElementType(maybeFormat)) {
          area.setFormat(maybeFormat);
          return true;
        }
      }

      if (isInsertActionId(actionId)) {
        runInsertMenuAction({
          actionId,
          area,
          toast,
          getNextPhotoMontageNumber: () => {
            const value = photoMontageCounterRef.current;
            photoMontageCounterRef.current += 1;
            return value;
          },
        });
        return true;
      }

      return false;
    },
    [areaRef, toast]
  );
};
