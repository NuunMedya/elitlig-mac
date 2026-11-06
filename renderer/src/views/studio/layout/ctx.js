// Yerleşim bağlamı (Workspace sağlar; paneller, panolar, katalog ve Ayarlar okur).
import { createContext, useContext } from "react";

export const LayoutCtx = createContext(null);
export const useLayoutCtx = () => useContext(LayoutCtx);
