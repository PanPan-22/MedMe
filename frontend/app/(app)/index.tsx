import { useUser } from "@clerk/expo";
import { Redirect } from "expo-router";

export default function RootIndex() {
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as string | undefined;
  if (role === "caretaker") return <Redirect href="/caretaker" />;
  return <Redirect href="/patient" />;
}
