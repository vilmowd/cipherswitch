import LegalPage, { LegalSection } from "../../components/LegalPage";

export const metadata = {
  title: "Terms and conditions — CipherSwitch",
  description: "The terms for using CipherSwitch.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and conditions"
      intro="These terms cover use of CipherSwitch. By creating a vault, checking in, or opening a released vault, you agree to them. If you do not agree, do not use the service."
    >
      <LegalSection title="Who may use it">
        <p>
          You must be at least 18 years old and able to enter a contract where
          you live. You may name a recipient only if you have a lawful reason
          to send that person the material and to use their email address for
          that purpose.
        </p>
      </LegalSection>
      <LegalSection title="Your vault">
        <p>
          You choose the contents, the passphrase, the schedule, and the
          recipients. You are responsible for keeping the passphrase, the
          dashboard code, and the check-in link. The dashboard opens with that
          code, which is emailed to you. Your email address is not the code.
          CipherSwitch does not send the passphrase by email and cannot reset
          it. Recipients are not emailed when you seal a vault. With the dashboard
          code you can delete the vault, or replace the sealed message and
          files. Deleting cannot be undone.
        </p>
        <p>
          You confirm that you have the right to store and, if the vault
          triggers, to release the contents. Do not store anything you are not
          allowed to possess or to disclose.
        </p>
      </LegalSection>
      <LegalSection title="Check-ins and release">
        <p>
          A vault releases when its rules say it should: the check-in deadline
          and any grace period have passed, a scheduled release time has
          passed, or you force a dry-run trigger. Release depends on the
          service running and on email delivery. When it triggers, the email
          to a recipient contains the message and any zip or rar files. Those
          steps can fail. A missed
          check-in can also be a mistake. Build the schedule with that in mind.
        </p>
      </LegalSection>
      <LegalSection title="Payments">
        <p>
          The first vault for an email, with one recipient and no extras, is
          free. Extra recipients, files, a time-lock, and travel mode each have
          their own one-time fee. None of those comfort fees is more than $5.
          Another vault is a separate one-time fee only while that email
          still has an active vault. If the vault is deleted and none are
          left active, the next vault is free again, aside from any comfort
          fees. A comfort fee is charged again the next time you use that
          feature, including turning travel mode on later. It is not a
          subscription.
        </p>
        <p>
          Card payments are processed by Stripe. CipherSwitch does not store
          the card number. A paid checkout can be used once. If the vault is
          not sealed after payment, that checkout can still be used for the
          same action until it is used. Except where the law requires a
          refund, the fee is for the attempt to use the feature and is not
          returned because a passphrase was lost or a check-in was missed.
        </p>
      </LegalSection>
      <LegalSection title="Acceptable use">
        <p>You may not use CipherSwitch to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>break the law, or help someone else break the law</li>
          <li>distribute malware, including a harmful file disguised as something important, or try to break into systems you do not control</li>
          <li>defraud, extort, stalk, or threaten anyone</li>
          <li>send material to a person who did not need to be involved, or misuse their email address</li>
          <li>interfere with the service, probe it without permission, or overload it</li>
        </ul>
        <p>
          The operator may refuse, disable, or remove a vault that appears to
          break these terms. Hashed tokens and ciphertext can be deleted from
          the database the operator controls.
        </p>
      </LegalSection>
      <LegalSection title="Malware">
        <p>
          You must not use CipherSwitch to store, send, or release malware.
          That includes viruses, trojans, ransomware, spyware, and any other
          file or instruction meant to damage a device, steal access, or trick
          a recipient into running something harmful.
        </p>
        <p>
          Only .zip and .rar files can be attached. CipherSwitch checks that
          format and does not open the archive or scan what is inside. You are
          responsible for every file you attach. The release email says that a
          file was not scanned and may be unsafe. The operator may disable or
          delete a vault that appears to be used to distribute malware.
        </p>
      </LegalSection>
      <LegalSection title="No professional advice">
        <p>
          Nothing on this site is legal, tax, medical, financial, or estate
          advice. CipherSwitch does not tell you whether a vault is the right
          way to pass on information, and it does not replace a will or a
          lawyer.
        </p>
      </LegalSection>
      <LegalSection title="The service is provided as available">
        <p>
          CipherSwitch is provided as available. There is no promise that the
          site, the email provider, or a vault will work without interruption,
          on a particular schedule, or without error. To the extent the law
          allows, the operator disclaims implied warranties of merchantability,
          fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          To the extent the law allows, the operator is not liable for lost
          messages, late or early release, a failed check-in, a lost
          passphrase, email that is not delivered, or decisions someone makes
          after reading a released vault. Nothing here limits liability that
          the law where you live does not allow to be limited, including
          liability for fraud or for death or personal injury caused by
          negligence where that limit is prohibited.
        </p>
      </LegalSection>
      <LegalSection title="Your responsibility for what you release">
        <p>
          You will cover the operator for claims, losses, and reasonable legal
          costs that come from the contents you store, the people you name, or
          your breach of these terms, except to the extent the claim is caused
          by the operator’s own fraud or wilful misconduct.
        </p>
      </LegalSection>
      <LegalSection title="Changes and the law that applies">
        <p>
          These terms can be updated by changing this page. The date at the
          top is the latest version. If you keep using the service after an
          update, the new terms apply to that later use. Vaults already sealed
          stay subject to the rules you accepted when you created them, plus
          any change the law requires.
        </p>
        <p>
          The law of the place where the operator of this deployment is
          established applies, except where the law where you live gives you
          rights that cannot be waived. These terms do not remove those rights.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
