/* Interactive hover button (shadcn-style community component), adapted to this project's theme:
   shadcn's primary / primary-foreground / background tokens map to accent / accent-ink / a dark glass
   fill, since the button sits over the 3D view. Also exported as a link for navigation. */
import React from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const root = "group relative inline-flex min-w-36 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/20 bg-[rgba(20,17,14,.72)] px-5 py-2 text-center text-[14px] font-semibold text-[#f3ead9] no-underline backdrop-blur-md";

/** label slides out, an accent fill grows from the dot and the label returns with an arrow */
function Inner({ text, back }: { text: string; back?: boolean }) {
  const Arrow = back ? ArrowLeft : ArrowRight;
  return (
    <>
      <span className={cn("relative z-0 inline-block transition-all duration-300 group-hover:opacity-0", "translate-x-1.5", back ? "group-hover:-translate-x-12" : "group-hover:translate-x-12")}>
        {text}
      </span>
      <div className={cn("absolute top-0 z-10 flex h-full w-full items-center justify-center gap-2 text-accent-ink opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100", back ? "-translate-x-12" : "translate-x-12")}>
        {back && <Arrow className="h-4 w-4" />}
        <span>{text}</span>
        {!back && <Arrow className="h-4 w-4" />}
      </div>
      <div className={cn("absolute top-[40%] h-2 w-2 scale-100 rounded-lg bg-accent transition-all duration-300 group-hover:top-0 group-hover:h-full group-hover:w-full group-hover:scale-[1.8]", "left-3.5 group-hover:left-0")} />
    </>
  );
}

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  /** arrow points left and the motion runs right-to-left (for "back" actions) */
  back?: boolean;
}

const InteractiveHoverButton = React.forwardRef<HTMLButtonElement, InteractiveHoverButtonProps>(({ text = "Button", back, className, ...props }, ref) => (
  <button ref={ref} className={cn(root, className)} {...props}>
    <Inner text={text} back={back} />
  </button>
));
InteractiveHoverButton.displayName = "InteractiveHoverButton";

function InteractiveHoverLink({ text, back, className, ...props }: React.ComponentProps<typeof Link> & { text: string; back?: boolean }) {
  return (
    <Link className={cn(root, className)} {...props}>
      <Inner text={text} back={back} />
    </Link>
  );
}

export { InteractiveHoverButton, InteractiveHoverLink };
