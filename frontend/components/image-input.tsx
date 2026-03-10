import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { ThemedText } from './themed-text';

const ImageInput = () => {
    const [image, setImage] = useState('');

    const takePhoto = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            alert('Camera permission is required to take a photo');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 1,
            aspect: [4, 3],
        });
        console.log("Camera!")

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    }
    const handleImagePickerPress = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
        });
        console.log("Gallery!")
        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    }
    // const pickFromGallery = async () => {
    //     const result = await
    //         launchImageLibrary({
    //             mediaType: 'photo',
    //         },
    //             (response) => {
    //                 if (response.assets) {
    //                     setImage(response.assets[0]);
    //                 }
    //             })
    // };

    return (
        <View>
            <ThemedText type='title'>Disturbing the Peace:</ThemedText>
            <TouchableOpacity onPress={takePhoto}>
                <ThemedText type='subtitle'>Take Photo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleImagePickerPress}>
                <ThemedText type='subtitle'>Pick from Gallery</ThemedText>
            </TouchableOpacity>
            {image && <Image source={{ uri: image }} style={{ width: 250, height: 250 }} resizeMode='contain' />}
        </View>
    )
}

export default ImageInput;