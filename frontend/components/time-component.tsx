import Feather from "@expo/vector-icons/Feather";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

const TimeComponent = () => {
    const [time, setTime] = useState(new Date().toLocaleTimeString());

    useEffect(() => {
        const timerId = setInterval(() => {
            setTime(new Date().toLocaleTimeString())
        }, 60001);
        return () => clearInterval(timerId);
    }, []);

    return (
    <View className="flex-row border-2 border-[#FFB916] bg-amber-50 rounded-full items-center justify-center gap-2 px-3 py-1">
        <Feather name="moon" size={32} color="#FFB916" />
        <Text className="text-[#FFB916] text-center text-3xl">{time.substring(0, 5)}</Text>
    </View>)
}

export default TimeComponent;