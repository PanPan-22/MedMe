
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Image, StyleSheet } from 'react-native';

export default function MedicineScreen() {
    return(
        <ThemedView style={styles.titleContainer}>
        <ThemedText>Medicine Screen!!</ThemedText>
        <Image source={{ uri: 'https://en.touhouwiki.net/images/e/ea/Th09MedicineMelancholy.png' }} style={{ width: 200, height: 200 }} />
        </ThemedView>
    )}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});