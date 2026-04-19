import { useColorScheme } from "nativewind";

const BRAND = { light: "#062d13", dark: "#86efac" };
const BRAND_SOFT = { light: "#374B3E", dark: "#4ade80" };
const BG = { light: "#f2fbf5", dark: "#0a1410" };

export function useBrandColor() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  return {
    primary: isDark ? BRAND.dark : BRAND.light,
    primarySoft: isDark ? BRAND_SOFT.dark : BRAND_SOFT.light,
    background: isDark ? BG.dark : BG.light,
  };
}
