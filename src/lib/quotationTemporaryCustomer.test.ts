import { describe, expect, it } from "vitest";
import {
  buildQuotationTemporaryCustomerPayload,
  normalizeQuotationTemporaryCustomer,
} from "./quotationTemporaryCustomer";

describe("quotation temporary customer room fields", () => {
  it("includes building, unit and room fields when creating from a quick customer", () => {
    const payload = buildQuotationTemporaryCustomerPayload({
      isNewCustomerMode: true,
      quickCustomer: {
        name: "列",
        designer_name: "叶婷",
        phone: "13800000000",
        address: "栗岭坪公交站",
        area_size: "88",
        building_no: "H7",
        unit_no: "4",
        room_no: "1023",
        no_room_number: false,
      },
      temporaryCustomer: {},
    });

    expect(payload).toMatchObject({
      building_no: "H7",
      unit_no: "4",
      room_no: "1023",
      no_room_number: false,
    });
  });

  it("keeps room fields when no-room-number is not selected", () => {
    const normalized = normalizeQuotationTemporaryCustomer({
      temp_customer: {
        name: "列",
        address: "栗岭坪公交站",
        building_no: "H7",
        unit_no: "4",
        room_no: "1023",
        no_room_number: false,
      },
    });

    expect(normalized).toMatchObject({
      buildingNo: "H7",
      unitNo: "4",
      roomNo: "1023",
      noRoomNumber: false,
    });
  });

  it("clears room fields when no-room-number is selected", () => {
    const normalized = normalizeQuotationTemporaryCustomer({
      temp_customer: {
        building_no: "H7",
        unit_no: "4",
        room_no: "1023",
        no_room_number: true,
      },
    });

    expect(normalized).toMatchObject({
      buildingNo: "",
      unitNo: "",
      roomNo: "",
      noRoomNumber: true,
    });
  });
});
