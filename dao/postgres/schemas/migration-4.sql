-- Create new table access_tokens

CREATE TABLE wicked.access_tokens (
    access_token character varying(64) NOT NULL,
    refresh_token character varying(64),
    authenticated_userid character varying(1024) NOT NULL,
    users_id character varying(64),
    expires bigint NOT NULL,
    expires_refresh bigint,
    data jsonb
);

ALTER TABLE ONLY wicked.access_tokens
    ADD CONSTRAINT access_tokens_pkey PRIMARY KEY (access_token);

CREATE UNIQUE INDEX refresh_token_idx ON wicked.access_tokens USING btree (refresh_token);
CREATE INDEX authenticated_userid_idx ON wicked.access_tokens USING btree (authenticated_userid);
CREATE INDEX users_id_idx ON wicked.access_tokens USING btree (users_id);
--CREATE INDEX expires_idx ON wicked.access_tokens USING ... (expires); TODO check this
--CREATE INDEX expires_refresh_idx ON wicked.access_tokens USING ... (expires_refresh); TODO check this
