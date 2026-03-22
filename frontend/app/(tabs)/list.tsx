import { StartDB } from "@/components/local_database";
import { ThemedText } from "@/components/themed-text";
import { View } from "react-native";

export default function ListScreen() {
    return (
        <View style = {{marginTop: 50, alignItems: 'center', gap: 20}}>
            <ThemedText type="title">This is the List Screen!</ThemedText>
            <StartDB />
        </View>
    );
}