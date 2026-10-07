"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function DataStatusNotifier({
  success = true,
  recordCount = 0,
}: {
  success?: boolean;
  recordCount?: number;
}) {
  const hasShownToast = useRef(false);

  useEffect(() => {
    // Prevent duplicate toast from React Strict Mode
    if (hasShownToast.current) return;
    if (recordCount === 0) return; // Wait until data is loaded

    hasShownToast.current = true;

    if (success) {
      toast.success("อัปเดตข้อมูลเรียบร้อย", {
        description: `โหลดข้อมูลครบถ้วน ${recordCount} รายการ พร้อมใช้งาน`,
        icon: <CheckCircle2 className="text-success-500 w-5 h-5" />,
        duration: 4000,
      });
    } else {
      toast.error("เชื่อมต่อข้อมูลไม่สำเร็จ", {
        description: "โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
        icon: <AlertCircle className="text-error-500 w-5 h-5" />,
      });
    }
  }, [success, recordCount]);

  return null;
}
