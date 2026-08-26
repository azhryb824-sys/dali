import SignatureUploadClient from "./SignatureUploadClient";

export default async function ContractSignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignatureUploadClient token={token}/>;
}
