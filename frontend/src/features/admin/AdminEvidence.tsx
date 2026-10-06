import { useEffect, useState } from "react";
import { request } from "../orders/api";
import {
  DocumentDetailsCard,
  type DocumentDetails,
  type PaymentDetails,
} from "../orders/OrderEvidenceCards";
import { formatVnd } from "../../shared/formatting/currency";
import { Load } from "../account/shared";

export function AdminEvidence({
  orderId,
  version,
  tab,
}: {
  orderId: string;
  version: number;
  tab: string;
}) {
  return (
    <>
      <section
        id="panel-documents"
        role="tabpanel"
        aria-labelledby="tab-documents"
        hidden={tab !== "documents"}
        className="content-panel orders-section"
      >
        <h2>Hồ sơ và giấy tờ</h2>
        <AdminDocuments orderId={orderId} version={version} />
      </section>
      <section
        hidden={tab !== "payments"}
        className="content-panel orders-section"
      >
        <h2>Đối soát thanh toán</h2>
        <AdminPaymentSummary orderId={orderId} version={version} />
      </section>
    </>
  );
}
function AdminDocuments({
  orderId,
  version,
}: {
  orderId: string;
  version: number;
}) {
  const [data, setData] = useState<DocumentDetails | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    request<DocumentDetails>(`/admin/orders/${orderId}/documents`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [orderId, version, retry]);
  return (
    <>
      {data && <DocumentDetailsCard initial={data} admin />}
      {(!data || error) && (
        <Load error={error} retry={() => setRetry((v) => v + 1)} />
      )}
    </>
  );
}
function AdminPaymentSummary({
  orderId,
  version,
}: {
  orderId: string;
  version: number;
}) {
  const [data, setData] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    request<PaymentDetails>(`/admin/orders/${orderId}/payment-details`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [orderId, version, retry]);
  return (
    <>
      {data && (
        <>
          <dl className="orders-metadata">
            <dt>Cọc yêu cầu (trong giá chốt)</dt>
            <dd>{formatVnd(data.depositRequiredVnd)}</dd>
            <dt>Đã thu xác nhận</dt>
            <dd>{formatVnd(data.receivedVnd)}</dd>
            <dt>Đã hoàn xác nhận</dt>
            <dd>{formatVnd(data.refundedVnd)}</dd>
          </dl>
          <p className="orders-help">
            Tổng từ API bao gồm toàn bộ giao dịch của đơn. Chỉ khoản đã xác nhận
            được tính vào số thu/hoàn.
          </p>
        </>
      )}
      {(!data || error) && (
        <Load error={error} retry={() => setRetry((v) => v + 1)} />
      )}
    </>
  );
}
