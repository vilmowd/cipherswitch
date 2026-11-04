import ContactForm from "../../components/ContactForm";

export const metadata = {
  title: "Contact — CipherSwitch",
  description: "Send a message to CipherSwitch.",
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky">
        CipherSwitch
      </p>
      <h1 className="mt-3 heading-caps text-4xl text-ink sm:text-5xl">Contact</h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft">
        Send a note about the site. The message is emailed to CipherSwitch and
        is not stored in a vault.
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </article>
  );
}
