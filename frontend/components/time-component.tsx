import Feather from "@expo/vector-icons/Feather";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

const formatTime = (d: Date) => {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

const isNightHour = (h: number) => h >= 18 || h < 6;

const hourFromTimeStr = (t: string) => parseInt(t.split(":")[0], 10);

const TimeComponent = ({ time }: { time?: string }) => {
  const now = new Date();
  const [currentTime, setCurrentTime] = useState(formatTime(now));
  const [currentNight, setCurrentNight] = useState(isNightHour(now.getHours()));

  useEffect(() => {
    if (time) return;
    const timerId = setInterval(() => {
      const d = new Date();
      setCurrentTime(formatTime(d));
      setCurrentNight(isNightHour(d.getHours()));
    }, 60000);
    return () => clearInterval(timerId);
  }, [time]);

  const displayTime = time ?? currentTime;
  const night = time ? isNightHour(hourFromTimeStr(time)) : currentNight;
  const color = night ? "#3B82F6" : "#FFB916";
  const bg = night ? "border-[#3B82F6] bg-blue-50" : "border-[#FFB916] bg-amber-50";

  return (
    <View className={`flex-row border-2 ${bg} rounded-full items-center justify-center gap-2 px-3 py-1`}>
      <Feather name={night ? "moon" : "sun"} size={32} color={color} />
      <Text style={{ color }} className="text-center text-3xl">
        {displayTime}
      </Text>
    </View>
  );
};

export default TimeComponent;
