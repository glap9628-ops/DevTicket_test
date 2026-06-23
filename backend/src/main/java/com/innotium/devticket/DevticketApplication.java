package com.innotium.devticket;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.innotium.devticket.domain")
public class DevticketApplication {

    public static void main(String[] args) {
        SpringApplication.run(DevticketApplication.class, args);
    }
}
