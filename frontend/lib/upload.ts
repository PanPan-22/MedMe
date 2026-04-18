import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_WIDTH = 800;
const QUALITY = 0.6;

export async function uploadMedImage(localUri: string, _ownerClerkId: string): Promise<string> {
  if (!localUri) return "";
  if (localUri.startsWith("http://") || localUri.startsWith("https://") || localUri.startsWith("data:")) {
    return localUri;
  }

  const manipulated = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: false },
  );

  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/jpeg;base64,${base64}`;
}
