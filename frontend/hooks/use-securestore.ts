import * as SecureStore from "expo-secure-store";

export const useSecureStorage = () => {
  // Save a specific key-value pair
  const save = async (key: string, value: string) => {
    await SecureStore.setItemAsync(key, value);
  };

  // Get a specific value
  const getValue = async (key: string) => {
    return await SecureStore.getItemAsync(key);
  };

  // NEW: Initialize multiple keys at once
  // This checks if keys exist, if not, sets them to defaults
  const initialize = async (defaults: Record<string, string>) => {
    const promises = Object.entries(defaults).map(
      async ([key, defaultValue]) => {
        const existing = await SecureStore.getItemAsync(key);
        if (existing === null) {
          await SecureStore.setItemAsync(key, defaultValue);
        }
      },
    );
    await Promise.all(promises);
  };

  return { save, getValue, initialize };
};
