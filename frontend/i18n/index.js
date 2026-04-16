import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import th from "./th.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    th: { translation: th },
  },
  lng: getLocales()[0].languageCode ?? "th",
  fallbackLng: "th",
  interpolation: { escapeValue: false },
});

export default i18n;
