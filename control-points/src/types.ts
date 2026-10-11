export type Point={id:string;dataset_id:string;code:string;original_code:string;name:string;north:number;east:number;height:number|null;lon:number;lat:number;crs:string;epsg:number;height_type:string;height_datum:string|null;category:string;description:string;notes:string;source_row:number;source_sheet:string;raw:string;status:string;favorite:number;version:number;updated_at:string;deleted_at:string|null};
export type Dataset={id:string;name:string;crs:string;epsg:number;height_type:string;height_datum:string|null;source_name:string;source_hash:string;imported_at:string;point_count:number;metadata:string};
export type Visit={id:string;point_id:string;status:string;note:string;visited_at:string;position:string|null;created_at:string;pending?:boolean};
export type Attachment={id:string;point_id:string;visit_id:string|null;filename:string;mime:string;size:number;category:string;thumb_key:string|null;created_at:string;captured_at:string;pending?:boolean};
export type Position={lon:number;lat:number;accuracy:number;timestamp:number};
export type QueueItem={id:string;kind:'visit'|'attachment';pointId:string;code:string;createdAt:string;payload:any;file?:Blob;thumbnail?:Blob;filename?:string;error?:string};
export type OfflinePack={datasets:Dataset[];points:Point[];visits:Visit[];attachments:Attachment[];downloadedAt:string;withPhotos:boolean};
