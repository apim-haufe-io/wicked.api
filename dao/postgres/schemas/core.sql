--
-- PostgreSQL database dump
--

-- Dumped from database version 9.6.5
-- Dumped by pg_dump version 9.6.3

-- Started on 2017-11-14 21:56:14 CET

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 8 (class 2615 OID 16385)
-- Name: wicked; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA wicked;


ALTER SCHEMA wicked OWNER TO postgres;

SET search_path = wicked, pg_catalog;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- TOC entry 188 (class 1259 OID 16408)
-- Name: applications; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE applications (
    id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE applications OWNER TO postgres;

--
-- TOC entry 191 (class 1259 OID 16444)
-- Name: approvals; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE approvals (
    id character varying(128) NOT NULL,
    subscriptions_id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE approvals OWNER TO postgres;

--
-- TOC entry 195 (class 1259 OID 16491)
-- Name: grants; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE grants (
    id character varying(128) NOT NULL,
    users_id character varying(128) NOT NULL,
    subscriptions_id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE grants OWNER TO postgres;

--
-- TOC entry 196 (class 1259 OID 16514)
-- Name: meta; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE meta (
    id bigint NOT NULL,
    data jsonb
);


ALTER TABLE meta OWNER TO postgres;

--
-- TOC entry 187 (class 1259 OID 16394)
-- Name: owners; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE owners (
    id character varying(128) NOT NULL,
    users_id character varying(128) NOT NULL,
    applications_id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE owners OWNER TO postgres;

--
-- TOC entry 194 (class 1259 OID 16478)
-- Name: registrations; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE registrations (
    id character varying(128) NOT NULL,
    pool_id character varying(128) NOT NULL,
    users_id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE registrations OWNER TO postgres;

--
-- TOC entry 189 (class 1259 OID 16422)
-- Name: subscriptions; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE subscriptions (
    id character varying(128) NOT NULL,
    applications_id character varying(128) NOT NULL,
    plan_id character varying(128) NOT NULL,
    api_id character varying(128) NOT NULL,
    client_id character varying(128),
    data jsonb
);


ALTER TABLE subscriptions OWNER TO postgres;

--
-- TOC entry 186 (class 1259 OID 16386)
-- Name: users; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE users (
    id character varying(64) NOT NULL,
    data jsonb NOT NULL,
    email character varying(256) COLLATE pg_catalog."C.UTF-8",
    custom_id character varying(256) COLLATE pg_catalog."C.UTF-8"
);


ALTER TABLE users OWNER TO postgres;

--
-- TOC entry 190 (class 1259 OID 16430)
-- Name: verifications; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE verifications (
    id character varying(128) NOT NULL,
    users_id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE verifications OWNER TO postgres;

--
-- TOC entry 193 (class 1259 OID 16465)
-- Name: webhook_events; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE webhook_events (
    id character varying(128) NOT NULL,
    webhook_listeners_id character varying(128),
    data jsonb
);


ALTER TABLE webhook_events OWNER TO postgres;

--
-- TOC entry 192 (class 1259 OID 16457)
-- Name: webhook_listeners; Type: TABLE; Schema: wicked; Owner: postgres
--

CREATE TABLE webhook_listeners (
    id character varying(128) NOT NULL,
    data jsonb
);


ALTER TABLE webhook_listeners OWNER TO postgres;

--
-- TOC entry 2062 (class 2606 OID 16415)
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- TOC entry 2071 (class 2606 OID 16451)
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);


--
-- TOC entry 2080 (class 2606 OID 16498)
-- Name: grants grants_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY grants
    ADD CONSTRAINT grants_pkey PRIMARY KEY (id);


--
-- TOC entry 2085 (class 2606 OID 16521)
-- Name: meta meta_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (id);


--
-- TOC entry 2060 (class 2606 OID 16401)
-- Name: owners owners_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY owners
    ADD CONSTRAINT owners_pkey PRIMARY KEY (id);


--
-- TOC entry 2077 (class 2606 OID 16485)
-- Name: registrations registrations_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY registrations
    ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);


--
-- TOC entry 2066 (class 2606 OID 16429)
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- TOC entry 2056 (class 2606 OID 16393)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 2069 (class 2606 OID 16437)
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- TOC entry 2075 (class 2606 OID 16472)
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- TOC entry 2073 (class 2606 OID 16464)
-- Name: webhook_listeners webhook_listeners_pkey; Type: CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY webhook_listeners
    ADD CONSTRAINT webhook_listeners_pkey PRIMARY KEY (id);


--
-- TOC entry 2057 (class 1259 OID 16421)
-- Name: fki_applications_fkey; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX fki_applications_fkey ON owners USING btree (applications_id);


--
-- TOC entry 2067 (class 1259 OID 16443)
-- Name: fki_users_fkey; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX fki_users_fkey ON verifications USING btree (users_id);


--
-- TOC entry 2058 (class 1259 OID 16407)
-- Name: fki_users_id; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX fki_users_id ON owners USING btree (users_id);


--
-- TOC entry 2081 (class 1259 OID 16508)
-- Name: grants_subscriptions_id_idx; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX grants_subscriptions_id_idx ON grants USING btree (subscriptions_id);


--
-- TOC entry 2082 (class 1259 OID 16509)
-- Name: grants_subscriptions_users_idx; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE UNIQUE INDEX grants_subscriptions_users_idx ON grants USING btree (users_id, subscriptions_id);


--
-- TOC entry 2083 (class 1259 OID 16507)
-- Name: grants_users_id_idx; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX grants_users_id_idx ON grants USING btree (users_id);


--
-- TOC entry 2078 (class 1259 OID 16511)
-- Name: registrations_users_pool_idx; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE UNIQUE INDEX registrations_users_pool_idx ON registrations USING btree (users_id, pool_id);


--
-- TOC entry 2063 (class 1259 OID 16512)
-- Name: subscriptions_applications_id_idx; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX subscriptions_applications_id_idx ON subscriptions USING btree (applications_id);


--
-- TOC entry 2064 (class 1259 OID 16513)
-- Name: subscriptions_client_id_idx; Type: INDEX; Schema: wicked; Owner: postgres
--

CREATE INDEX subscriptions_client_id_idx ON subscriptions USING btree (client_id);


--
-- TOC entry 2087 (class 2606 OID 16416)
-- Name: owners applications_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY owners
    ADD CONSTRAINT applications_fkey FOREIGN KEY (applications_id) REFERENCES applications(id) ON DELETE CASCADE;


--
-- TOC entry 2089 (class 2606 OID 16452)
-- Name: approvals subscriptions_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY approvals
    ADD CONSTRAINT subscriptions_fkey FOREIGN KEY (subscriptions_id) REFERENCES subscriptions(id) ON DELETE CASCADE;


--
-- TOC entry 2086 (class 2606 OID 16402)
-- Name: owners users_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY owners
    ADD CONSTRAINT users_fkey FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- TOC entry 2088 (class 2606 OID 16438)
-- Name: verifications users_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY verifications
    ADD CONSTRAINT users_fkey FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- TOC entry 2091 (class 2606 OID 16486)
-- Name: registrations users_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY registrations
    ADD CONSTRAINT users_fkey FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- TOC entry 2092 (class 2606 OID 16499)
-- Name: grants users_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY grants
    ADD CONSTRAINT users_fkey FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- TOC entry 2090 (class 2606 OID 16473)
-- Name: webhook_events webhook_listeners_fkey; Type: FK CONSTRAINT; Schema: wicked; Owner: postgres
--

ALTER TABLE ONLY webhook_events
    ADD CONSTRAINT webhook_listeners_fkey FOREIGN KEY (webhook_listeners_id) REFERENCES webhook_listeners(id) ON DELETE CASCADE;


INSERT INTO meta (id, data) VALUES (1, '{"version":0}');

-- Completed on 2017-11-14 21:56:14 CET

--
-- PostgreSQL database dump complete
--

