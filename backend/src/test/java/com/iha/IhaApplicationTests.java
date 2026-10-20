package com.iha;

import org.junit.jupiter.api.Test;

import org.springframework.boot.test.context.SpringBootTest;

/** Boots the dev profile: Flyway migrates H2 and Hibernate validates every entity against the schema. */
@SpringBootTest
class IhaApplicationTests {

	@Test
	void contextLoads() {
	}

}
