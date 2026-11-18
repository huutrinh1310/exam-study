import Link from "next/link";
import Icon from "./icon";

export default function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Clearstudy home">
      <span className="brand-mark">
        <Icon name="book" />
      </span>
      <span>clearstudy</span>
    </Link>
  );
}
