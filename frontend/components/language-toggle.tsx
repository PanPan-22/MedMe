import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";
import { useState } from "react";

export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.resolvedLanguage ?? "en");
  const isEn = lang === "en";

  const toggle = () => {
    const next = isEn ? "th" : "en";
    i18n.changeLanguage(next);
    setLang(next);
  };

  return (
    <Pressable
      onPress={toggle}
      className="active:opacity-70 flex-row items-center bg-primary/10 rounded-full px-4 py-2 gap-2"
    >
      <Text style={{ opacity: isEn ? 1 : 0.3 }} className="text-base">🇬🇧</Text>
      <Text style={{ opacity: isEn ? 1 : 0.3 }} className="text-base font-bold text-primary">EN</Text>
      <Text className="text-base text-gray-300">|</Text>
      <Text style={{ opacity: !isEn ? 1 : 0.3 }} className="text-base">🇹🇭</Text>
      <Text style={{ opacity: !isEn ? 1 : 0.3 }} className="text-base font-bold text-primary">TH</Text>
    </Pressable>
  );
}
