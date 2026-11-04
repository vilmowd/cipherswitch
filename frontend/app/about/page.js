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
          recipients. CipherSwitch encrypts the title and message on your
          device before anything is uploaded. The server stores the ciphertext,
          a salt, and hashes of the check-in and unlock tokens. It does not
          receive your passphrase or the readable message.
        </p>
        <p>
          A check-in link pushes the deadline forward and replaces the previous
          link. If the deadline passes, a grace period can start. When the
          vault triggers, recipients can request the ciphertext and decrypt it
          with the passphrase you shared with them. A witness can be notified
          without receiving a way to open the vault.
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
          If you lose the passphrase, nobody can recover the message, including
          the operator of this service. If you stop checking in by mistake, the
          vault can still open for the people you named.
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
