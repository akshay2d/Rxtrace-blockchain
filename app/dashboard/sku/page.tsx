import { redirect } from 'next/navigation';

export default function SkuRedirectPage() {
  redirect('/dashboard/products');
}
