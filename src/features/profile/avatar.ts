import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { getSupabase } from '@/lib/supabase';

/**
 * Opens the photo library, square-crops, and uploads to the avatars bucket
 * under the user's own folder (the only path storage RLS lets them write).
 * Returns the public URL with a cache-busting version, or null if the
 * person backed out of the picker.
 */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  // Native delivers base64; web sometimes only a blob URI.
  let body: ArrayBuffer;
  if (asset.base64) {
    body = decode(asset.base64);
  } else {
    const response = await fetch(asset.uri);
    body = await response.arrayBuffer();
  }

  const path = `${userId}/avatar.jpg`;
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) {
    throw new Error(error.message);
  }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
