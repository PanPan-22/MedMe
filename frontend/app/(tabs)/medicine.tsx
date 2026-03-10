
import ImageInput from '@/components/image-input';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Image, StyleSheet } from 'react-native';

export default function MedicineScreen() {
  return (
    <ParallaxScrollView headerBackgroundColor={{ light: '#ff8b8b', dark: '#1D3D47' }}
      headerImage={
        <Image source={{ uri: 'https://en.touhouwiki.net/images/e/ea/Th09MedicineMelancholy.png' }} style={{ width: 200, height: 200 }} />
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