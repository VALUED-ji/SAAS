export type QuotationTemporaryCustomerDraft = {
  name?: string;
  designer_name?: string;
  phone?: string;
  weixin?: string;
  address?: string;
  area?: string;
  area_size?: string;
  decoration_type?: string;
  building_no?: string;
  unit_no?: string;
  room_no?: string;
  no_room_number?: boolean;
};

export type QuotationTemporaryCustomerPayload = {
  name: string;
  designer_name: string;
  phone: string;
  weixin: string;
  address: string;
  area: string;
  decoration_type: string;
  building_no: string;
  unit_no: string;
  room_no: string;
  no_room_number: boolean;
};

export function buildQuotationTemporaryCustomerPayload({
  isNewCustomerMode,
  quickCustomer,
  temporaryCustomer,
}: {
  isNewCustomerMode: boolean;
  quickCustomer: QuotationTemporaryCustomerDraft;
  temporaryCustomer: QuotationTemporaryCustomerDraft;
}): QuotationTemporaryCustomerPayload {
  const source = isNewCustomerMode ? quickCustomer : temporaryCustomer;
  const noRoomNumber = isNewCustomerMode && Boolean(quickCustomer.no_room_number);
  return {
    name: String(source.name || ""),
    designer_name: String(source.designer_name || ""),
    phone: String(source.phone || ""),
    weixin: String(source.weixin || ""),
    address: String(source.address || ""),
    area: String(isNewCustomerMode ? quickCustomer.area_size || "" : temporaryCustomer.area || ""),
    decoration_type: String(source.decoration_type || ""),
    building_no: noRoomNumber ? "" : String(source.building_no || "").trim(),
    unit_no: noRoomNumber ? "" : String(source.unit_no || "").trim(),
    room_no: noRoomNumber ? "" : String(source.room_no || "").trim(),
    no_room_number: noRoomNumber,
  };
}

export function normalizeQuotationTemporaryCustomer(body: any) {
  const input = body?.temp_customer && typeof body.temp_customer === "object" ? body.temp_customer : body;
  const noRoomNumber = input?.no_room_number === true || input?.no_room_number === 1 || input?.no_room_number === "1";
  return {
    name: String(input?.name || input?.temp_customer_name || "").trim(),
    designerName: String(input?.designer_name || input?.temp_customer_designer_name || "").trim(),
    phone: String(input?.phone || input?.temp_customer_phone || "").trim(),
    weixin: String(input?.weixin || input?.temp_customer_weixin || "").trim(),
    address: String(input?.address || input?.temp_customer_address || "").trim(),
    area: safeNonNegativeNumber(input?.area ?? input?.temp_customer_area),
    decorationType: String(input?.decoration_type || input?.temp_customer_decoration_type || "").trim(),
    buildingNo: noRoomNumber ? "" : String(input?.building_no || input?.temp_customer_building_no || "").trim(),
    unitNo: noRoomNumber ? "" : String(input?.unit_no || input?.temp_customer_unit_no || "").trim(),
    roomNo: noRoomNumber ? "" : String(input?.room_no || input?.temp_customer_room_no || "").trim(),
    noRoomNumber,
  };
}

function safeNonNegativeNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}
