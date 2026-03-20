
import ImageInput from '@/components/image-input';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet } from 'react-native';

export default function MedicineScreen() {
  return (
    <ParallaxScrollView headerBackgroundColor={{ light: '#ff8b8b', dark: '#1D3D47' }}
      headerImage={
        <MaterialIcons name='medical-information' size={200} style={styles.headerImage} />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type='title'>Medicine Screen!</ThemedText>
      </ThemedView>
      <ImageInput />
    </ParallaxScrollView>
  );
}

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