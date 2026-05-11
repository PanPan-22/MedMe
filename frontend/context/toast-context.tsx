import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, Text } from "react-native";

type ToastType = "success" | "error";

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("success");

  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const showToast = (message: string, toastType: ToastType = "success") => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setMsg(message);
    setType(toastType);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        if (mounted.current) setMsg("");
      });
    }, 2500);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast UI */}
      {msg !== "" && (
        <Animated.View
          style={{
            position: "absolute",
            bottom: 50,
            left: 20,
            right: 20,
            opacity: opacity,
            transform: [{ translateY: translateY }],
            zIndex: 9999,
          }}
          // Use Tailwind for the layout and colors
          className={`p-4 rounded-2xl flex-row items-center justify-center shadow-lg ${
            type === "success" ? "bg-green-500" : "bg-red-500"
          }`}
        >
          <Text className="text-white font-bold text-base text-center">
            {msg}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};
