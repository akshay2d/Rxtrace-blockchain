import { redirect } from 'next/navigation';

export default function ScansRedirectPage() {
  redirect('/dashboard/history');
}
