import dates from './caseCaptureDates.json';
type ParcelSource={overlayUrl?:string;tilesetPath?:string};
export function caseCaptureDate(parcel:ParcelSource|undefined):string{
  // Legacy ion-only parcels have no verified association with these sources.
  if(!parcel?.overlayUrl)return '待補';
  const source=dates[(parcel.tilesetPath??'tileset.json') as keyof typeof dates];
  if(!source)return '待補';
  const start=source.startDate.replaceAll('-','/'),end=source.endDate.replaceAll('-','/');
  return start===end?start:`${start}－${end}`;
}
