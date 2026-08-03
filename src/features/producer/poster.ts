import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';

/**
 * Picks an event poster and uploads it to the public posters bucket under
 * the producer's own folder (the only path storage RLS lets them write).
 * Returns the public URL with a cache-busting version, or null when the
 * picker was dismissed.
 */
export async function pickAndUploadPoster(
  userId: string,
  seriesId: string,
): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.8,
    base64: true,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  let body: ArrayBuffer;
  if (asset.base64) {
    body = decode(asset.base64);
  } else {
    const response = await fetch(asset.uri);
    body = await response.arrayBuffer();
  }

  const path = `${userId}/${seriesId}.jpg`;
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from('posters')
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) {
    throw userError(error, 'Could not upload the poster. Try again.');
  }
  const { data } = supabase.storage.from('posters').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
