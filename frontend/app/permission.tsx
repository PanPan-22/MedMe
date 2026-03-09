import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as ExpoMediaLibrary from 'expo-media-library';
import * as React from 'react';
import { StyleSheet } from 'react-native';
import { CameraPermissionStatus } from 'react-native-vision-camera';

export default function PermissionScreen(){
    const [cameraPermission, setCameraPermission] = React.useState<CameraPermissionStatus>("not-determined");
    const [microphonePermission, setMicrophonePermission] = React.useState<CameraPermissionStatus>("not-determined");
    const [mediaLibraryPermission, setMediaLibraryPermission] = React.useState<ExpoMediaLibrary.PermissionStatus>();
    return(
        <>
        <ThemedView>
            <ThemedText>Camera Permission: {cameraPermission}</ThemedText>
            <ThemedText>Microphone Permission: {microphonePermission}</ThemedText>
            <ThemedText>Media Library Permission: {mediaLibraryPermission}</ThemedText>
            <ThemedText>MedMe wants to access your camera in order to work regularly.</ThemedText>
        </ThemedView>
        </>
    )
}

const styles = StyleSheet.create({
    container: {flex: 1, padding: 20},
    subtitle: {textAlign: 'center'}
})