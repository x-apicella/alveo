ALTER TABLE "messages" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
-- Preserve deterministic history order when upgrading existing data.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS sequence FROM messages
)
UPDATE messages SET sequence = ordered.sequence FROM ordered WHERE messages.id = ordered.id;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('messages', 'sequence'), COALESCE((SELECT max(sequence) FROM messages), 1), EXISTS(SELECT 1 FROM messages));--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_channel_sequence_idx" ON "messages" USING btree ("channel_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_author_client_idx" ON "messages" USING btree ("author_id","client_id");--> statement-breakpoint
-- Assign the replay position AFTER taking a transaction-scoped channel lock.
-- A bare sequence/default can commit out of order and permanently skip a send.
-- Applying this in a trigger also protects old clients and non-HTTP writers.
CREATE FUNCTION assign_message_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.channel_id::text, 0));
  NEW.sequence := nextval(pg_get_serial_sequence('messages', 'sequence'));
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER messages_assign_sequence BEFORE INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION assign_message_sequence();
