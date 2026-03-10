// import { ThemedText } from '@/components/themed-text';
// import { ThemedView } from '@/components/themed-view';
// import Ionicons from '@expo/vector-icons/Ionicons';
// import * as ExpoMediaLibrary from 'expo-media-library';
// import * as React from 'react';
// import { StyleSheet, Switch, View } from 'react-native';
// import { CameraPermissionStatus } from 'react-native-vision-camera';

// export default function PermissionScreen() {
//     const [cameraPermission, setCameraPermission] = React.useState<CameraPermissionStatus>("not-determined");
//     const [microphonePermission, setMicrophonePermission] = React.useState<CameraPermissionStatus>("not-determined");
//     const [mediaLibraryPermission, setMediaLibraryPermission] = React.useState<ExpoMediaLibrary.PermissionStatus>();
//     return (
//         <>
//             {/* <Stack.Screen options={{ headerTitle: "Permissions" }} /> */}

//             <ThemedView style={styles.container}>
//                 <View style={styles.container} />
//                 <ThemedText>Camera Permission: {cameraPermission}</ThemedText>
//                 <ThemedText>Microphone Permission: {microphonePermission}</ThemedText>
//                 <ThemedText>Media Library Permission: {mediaLibraryPermission}</ThemedText>
//                 <ThemedText type="subtitle" style={styles.subtitle}>
//                     MedMe wants to access your camera in order to work regularly.
//                 </ThemedText>
//                 <View style={styles.row}>
//                     <Ionicons name="lock-closed-outline" size={26} color={"green"} />
//                     <ThemedText style={styles.footnote}>Required</ThemedText>
//                 </View>
//                 <View style={StyleSheet.compose(styles.row, styles.permissionContainer)}>
//                     <Ionicons name="camera-outline" size={26} color={"gray"} />
//                     <View style={styles.permissionText}>
//                         <ThemedText type="subtitle">Camera</ThemedText>
//                         <ThemedText>Used for taking photos.</ThemedText>
//                     </View>
//                     <Switch trackColor={{ true: "green"}}
//                     value={cameraPermission === "granted"}
//                     // onChange = {requestCameraPermission} 
//                     />
//                 </View>
//             </ThemedView>
//         </>
//     )
// }

// const styles = StyleSheet.create({
//     container: {
//         flex: 1,
//         padding: 20,
//     },
//     subtitle: {
//         textAlign: "center",
//     },
//     footnote: {
//         fontSize: 12,
//         fontWeight: "bold",
//         letterSpacing: 2,
//     },
//     row: {
//         flexDirection: "row",
//         alignItems: "center",
//         gap: 6,
//     },
//     spacer: {
//         marginVertical: 8,
//     },
//     permissionContainer: {
//         backgroundColor: "#ffffff20",
//         borderRadius: 10,
//         padding: 10,
//         justifyContent: "space-between",
//     },
//     permissionText: {
//         marginLeft: 10,
//         flexShrink: 1,
//     },
//     continueButton: {
//         padding: 10,
//         borderWidth: 2,
//         borderColor: "white",
//         borderRadius: 50,
//         alignSelf: "center",
//     },
// });