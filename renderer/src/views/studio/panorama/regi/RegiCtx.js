// Panorama rejisi · bağlam: PanoramaStudio durumu ve işlemleri panellere (dockview portalları dahil).
import { createContext, useContext } from "react";

export const RegiCtx = createContext(null);
export const useRegi = () => useContext(RegiCtx);
