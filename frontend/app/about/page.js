import LegalPage, { LegalSection } from "../../components/LegalPage";

export const metadata = {
  title: "About — CipherSwitch",
  description: "What CipherSwitch is, and what it is not.",
};

export default function AboutPage() {
  return (
    <LegalPage
      title="About"
      intro="CipherSwitch is a dead man's switch. You seal a message in your browser. It stays sealed while you check in, and it can be opened by the people you named only after you go silent."
    >
      <LegalSection title="How it works">
        <p>
          You write a title and a message, choose a passphrase, and name
          recipients. A sealed copy is made in the browser before upload. The
          server also stores the readable title, the readable message, and any
          zip or rar files so they can be emailed later. It does not receive
          or email your passphrase. Recipients are not emailed when you seal
          the vault.
        </p>
        <p>
          A check-in link pushes the deadline forward and replaces the previous
          link. If the deadline passes, a grace period can start. When the
          vault triggers, each recipient is emailed the message and the archive
          files. A witness is notified without receiving the message. A backup
          recipient can be delayed.
        </p>
      </LegalSection>
      <LegalSection title="What CipherSwitch is not">
        <p>
          CipherSwitch is not a law firm, a bank, a doctor, or an estate
          planner. It is not a will, a trust, or a substitute for advice from a
          qualified professional. A triggered vault is not proof of death, and
          delivery of an email is not guaranteed.
        </p>
        <p>
          If you lose the passphrase, it cannot be reset. The stored message
          can still be emailed when the vault triggers. If you stop checking
          in by mistake, the people you named can still receive it.
        </p>
      </LegalSection>
      <LegalSection title="Who runs it">
        <p>
          “CipherSwitch” is the name of this software and of the service you
          are using. These pages describe that service. They do not create a
          separate company, and they do not name a registered office. The
          person or organization that operates the copy you are using is
          responsible for that deployment.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
